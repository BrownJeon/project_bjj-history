#!/usr/bin/env python3
"""Independent structural skin check; no generator import or native execution."""
from __future__ import annotations

import argparse
import base64
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
import xml.etree.ElementTree as ET

EXPECTED = {
    "profile": "ce9e93d2c1a2d637a59d3d20b8dafe57f42671ed103ccfae9ab99a24e6dd50f8",
    "timeline": "72f1570e147a16954fbb8201b133f59589f21021cf6d64c2f167a0be408faa96",
    "base_scene": "f510f92ba11b23d2bceaa036dffa02b1378db55489d887183f8361bf7d1b0bd4",
}
BONE_TAGS = {"Bone", "RootBone"}
MATRIX = ("xx", "xy", "yx", "yy", "tx", "ty")
NEW_TAGS = {"ImageAsset", "Image", "Mesh", "MeshVertex", "Weight", "Skin", "Tendon"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def finite(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Non-finite numeric value")
    return value


def labels(root):
    result, duplicate = {}, []

    def walk(node, prefix):
        suffix = node.tag + ":" + node.get("name", "")
        label = prefix + "/" + suffix
        if node.get("id"):
            if node.get("id") in result:
                duplicate.append(node.get("id"))
            result[node.get("id")] = label
        counts = Counter()
        for child in node:
            key = (child.tag, child.get("name", ""))
            counts[key] += 1
            walk(child, label + f"/[{child.tag}:{counts[key]}]")

    walk(root, "")
    if duplicate:
        raise ValueError("Duplicate RML IDs: " + str(duplicate[:5]))
    return result


def attributes(node, id_labels):
    result = {}
    for key, value in node.attrib.items():
        if key == "id":
            continue
        if key.endswith("Id"):
            if value not in id_labels:
                raise ValueError(f"Unresolved RML reference {key}={value}")
            value = id_labels[value]
        elif re.fullmatch(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?", value):
            value = finite(value)
            if value == 0:
                value = 0.0
        result[key] = value
    return result


def canonical(node, id_labels):
    return [node.tag, attributes(node, id_labels), (node.text or "").strip(),
            [canonical(child, id_labels) for child in node]]


def fingerprint(node, id_labels):
    return sha(json.dumps(canonical(node, id_labels), sort_keys=True).encode())


def bone_map(board):
    result = {}

    def walk(node, parent_bone=None):
        if node.tag in BONE_TAGS:
            name = node.get("name")
            if name in result:
                raise ValueError("Duplicate bone name: " + name)
            result[name] = (node, parent_bone)
            parent_bone = name
        for child in node:
            walk(child, parent_bone)

    walk(board)
    return result


def varuints(encoded):
    raw = base64.b64decode(encoded, validate=True)
    result, value, shift = [], 0, 0
    for byte in raw:
        value |= (byte & 127) << shift
        if byte & 128:
            shift += 7
            if shift > 28:
                raise ValueError("Triangle index varuint is too long")
        else:
            result.append(value)
            value, shift = 0, 0
    if shift:
        raise ValueError("Incomplete triangle index varuint")
    if len(result) % 3:
        raise ValueError("Triangle index count is not divisible by three")
    return [result[i:i + 3] for i in range(0, len(result), 3)]


def pose_fk(profile, sample):
    result = {}
    pending = {b["name"]: b for b in profile["bones"]}
    while pending:
        ready = [name for name, b in pending.items() if b["parent"] is None or b["parent"] in result]
        if not ready:
            raise ValueError("Cyclic profile hierarchy")
        for name in ready:
            b = pending.pop(name)
            parent = result.get(b["parent"])
            origin = parent["tip"] if parent else [sample["root"]["x"], sample["root"]["y"]]
            angle = sample["local_rotations_rad"][name] + (parent["angle"] if parent else 0)
            c, s = math.cos(angle), math.sin(angle)
            result[name] = {"origin": origin, "angle": angle,
                "tip": [origin[0] + b["length"] * c, origin[1] + b["length"] * s],
                "matrix": [c, s, -s, c, origin[0], origin[1]]}
    return result


def apply(matrix, point):
    a, b, c, d, x, y = matrix
    return [a * point[0] + c * point[1] + x, b * point[0] + d * point[1] + y]


def inverse(matrix):
    a, b, c, d, x, y = matrix
    determinant = a * d - b * c
    if abs(determinant) < 1e-12:
        raise ValueError("Singular tendon bind matrix")
    return [d / determinant, -b / determinant, -c / determinant, a / determinant,
            (c * y - d * x) / determinant, (b * x - a * y) / determinant]


def triangle_area(points, triangle):
    a, b, c = [points[i] for i in triangle]
    return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2


def verify(base, output):
    project = base / "skin-v2/project"
    paths = {"base_scene": base / "project/scene.rml", "scene": project / "scene.rml",
             "profile": base / "rig_profile.json", "timeline": base / "project/timeline.json",
             "manifest": project / "skin-assets.json", "build_receipt": project / "skin-build-receipt.json"}
    raw = {name: path.read_bytes() for name, path in paths.items()}
    data = {name: json.loads(raw[name]) for name in ("profile", "timeline", "manifest", "build_receipt")}
    before, after = [ET.fromstring(raw[name]) for name in ("base_scene", "scene")]
    before_labels, after_labels = labels(before), labels(after)
    errors, metrics, boards = [], {}, {}

    def require(condition, reason, **details):
        if not condition:
            errors.append({"reason": reason, **details})

    for name, expected in EXPECTED.items():
        require(sha(raw[name]) == expected, "original_input_hash_changed", input=name)
    receipt = data["build_receipt"]
    require(receipt["scene_sha256"] == sha(raw["scene"]), "scene_receipt_hash_mismatch")
    for name, key in (("profile", "profile"), ("timeline", "timeline"), ("manifest", "skin_assets")):
        require(receipt["source_hashes"][key] == sha(raw[name]), "source_receipt_hash_mismatch", input=name)
    require(before.attrib == after.attrib, "root_attributes_changed")
    before_counts = Counter(n.tag for n in before.iter())
    after_counts = Counter(n.tag for n in after.iter())
    for tag in BONE_TAGS | {"RotationConstraint", "LinearAnimation", "KeyedObject", "KeyedProperty",
            "KeyFrameDouble", "StateMachine", "StateMachineLayer", "AnimationState", "EntryState",
            "StateTransition", "AnyState", "ExitState", "LayoutComponentStyle"}:
        require(before_counts[tag] == after_counts[tag], "global_nonappearance_component_count_changed", tag=tag)
    added_tags = set(n.tag for n in after.iter()) - set(n.tag for n in before.iter())
    require(not added_tags - NEW_TAGS, "unexpected_new_nonappearance_tags", tags=sorted(added_tags - NEW_TAGS))
    old_boards = {b.get("name"): b for b in before if b.tag == "Artboard"}
    new_boards = {b.get("name"): b for b in after if b.tag == "Artboard"}
    require(set(old_boards) == set(new_boards) == {"Clean", "Rig"}, "artboard_names_changed")
    for name in sorted(set(old_boards) & set(new_boards)):
        old, new = old_boards[name], new_boards[name]
        require(attributes(old, before_labels) == attributes(new, after_labels), "artboard_attributes_changed", artboard=name)
        old_bones, new_bones = bone_map(old), bone_map(new)
        require(set(old_bones) == set(new_bones) and len(new_bones) == 16, "bone_names_or_count_changed", artboard=name)
        for bone in set(old_bones) & set(new_bones):
            old_node, old_parent = old_bones[bone]
            new_node, new_parent = new_bones[bone]
            require(old_parent == new_parent, "bone_parent_changed", artboard=name, bone=bone)
            require(attributes(old_node, before_labels) == attributes(new_node, after_labels),
                    "bone_transform_or_length_changed", artboard=name, bone=bone)
            for tag in ("RotationConstraint",):
                a = [canonical(n, before_labels) for n in old_node if n.tag == tag]
                b = [canonical(n, after_labels) for n in new_node if n.tag == tag]
                require(a == b and len(b) == 1, "native_constraint_changed", artboard=name, bone=bone)
        board_result = {"bone_count": len(new_bones),
                        "constraint_count": sum(n.tag == "RotationConstraint" for n in new.iter()),
                        "keyframe_count": sum(n.tag == "KeyFrameDouble" for n in new.iter())}
        for tag in ("LayoutComponentStyle", "LinearAnimation", "StateMachine"):
            a = [canonical(n, before_labels) for n in old if n.tag == tag]
            b = [canonical(n, after_labels) for n in new if n.tag == tag]
            require(a == b, tag + "_changed", artboard=name)
            board_result[tag + "_unchanged"] = a == b
        board_result["animation_fingerprints"] = [fingerprint(n, after_labels) for n in new if n.tag == "LinearAnimation"]
        boards[name] = board_result

    profile = data["profile"]
    rest = pose_fk(profile, data["timeline"]["frames"][0])
    sample_poses = {i: pose_fk(profile, data["timeline"]["frames"][i]) for i in (0, 54, 144, 240, 360)}
    assets = {n.get("id"): n for n in after if n.tag == "ImageAsset"}
    manifest_layers = {n["name"]: n for n in data["manifest"]["layers"]}
    layer_receipts = {n["name"]: n for n in receipt["layers"]}
    require(len(assets) == len(manifest_layers) == len(layer_receipts) == 10, "asset_layer_count_mismatch")
    image_records = []
    for name, layer in manifest_layers.items():
        image = (project / layer["file"]).resolve()
        require(image.is_relative_to(project.resolve()), "asset_path_escapes_project", layer=name)
        if not image.is_relative_to(project.resolve()):
            continue
        image_data = image.read_bytes()
        png_ok = image_data[:8] == b"\x89PNG\r\n\x1a\n" and image_data[12:16] == b"IHDR"
        size = list(struct.unpack(">II", image_data[16:24])) if png_ok else None
        require(png_ok and size == [layer["width"], layer["height"]], "png_dimensions_mismatch", layer=name)
        require(sha(image_data) == layer_receipts[name]["image_sha256"], "png_receipt_hash_mismatch", layer=name)
        image_records.append({"name": name, "file": layer["file"], "bytes": len(image_data), "sha256": sha(image_data), "size": size})

    metrics.update(mesh_count=0, vertex_count=0, triangle_count=0, tendon_count=0,
                   max_influences=0, weight_sum_error_max=0.0, quantization_weight_error_max=0.0,
                   tendon_matrix_error_max=0.0, frame0_bind_identity_error_max=0.0,
                   sampled_pose_bbox_error_max=0.0, uv_out_of_range_count=0,
                   degenerate_xy_triangles=0, degenerate_uv_triangles=0)
    for board_name, board in new_boards.items():
        bmap = bone_map(board)
        bone_ids = {node.get("id"): name for name, (node, _) in bmap.items()}
        images = [n for n in board if n.tag == "Image"]
        expected_order = [n["name"] for n in sorted(data["manifest"]["layers"], key=lambda x: x.get("order", 0))]
        require([n.get("name") for n in images] == expected_order, "image_layer_order_mismatch", artboard=board_name)
        for image in images:
            name = image.get("name")
            if name not in manifest_layers:
                require(False, "unknown_image_layer", layer=name)
                continue
            layer = manifest_layers[name]
            expected_image = {"x": 0, "y": 0, "originX": 0, "originY": 0, "scaleX": 1, "scaleY": 1}
            require(all(finite(image.get(k, v)) == v for k, v in expected_image.items()), "nonidentity_image_transform", layer=name)
            asset = assets.get(image.get("assetId"))
            require(asset is not None and asset.get("file") == layer["file"], "image_asset_reference_mismatch", layer=name)
            meshes = [n for n in image if n.tag == "Mesh"]
            require(len(meshes) == 1, "image_mesh_count_mismatch", layer=name)
            for mesh in meshes:
                metrics["mesh_count"] += 1
                vertices = [n for n in mesh if n.tag == "MeshVertex"]
                triangles = varuints(mesh.get("triangleIndexBytes", ""))
                metrics["vertex_count"] += len(vertices)
                metrics["triangle_count"] += len(triangles)
                require(len(vertices) == len(layer["vertices"]), "vertex_count_mismatch", layer=name)
                require(triangles == layer["triangles"], "triangle_manifest_mismatch", layer=name)
                skins = [n for n in mesh if n.tag == "Skin"]
                require(len(skins) == 1, "skin_count_mismatch", layer=name)
                if len(skins) != 1:
                    continue
                skin = skins[0]
                require([finite(skin.get(k)) for k in MATRIX] == [1, 0, 0, 1, 0, 0], "nonidentity_skin_transform", layer=name)
                tendons = [n for n in skin if n.tag == "Tendon"]
                tendon_names, inverse_bind = [], []
                for tendon in tendons:
                    metrics["tendon_count"] += 1
                    bone = bone_ids.get(tendon.get("boneId"))
                    require(bone in rest, "unknown_tendon_bone", layer=name)
                    if bone not in rest:
                        continue
                    require(bone not in tendon_names, "duplicate_tendon_bone", layer=name, bone=bone)
                    tendon_names.append(bone)
                    matrix = [finite(tendon.get(k)) for k in MATRIX]
                    error = max(abs(a - b) for a, b in zip(matrix, rest[bone]["matrix"]))
                    metrics["tendon_matrix_error_max"] = max(metrics["tendon_matrix_error_max"], error)
                    require(error < 1e-9, "tendon_not_global_rest_matrix", layer=name, bone=bone)
                    inverse_bind.append(inverse(matrix))
                require(tendon_names == layer_receipts[name]["tendons"], "tendon_order_mismatch", layer=name)
                xy, uv, influences = [], [], []
                for index, vertex in enumerate(vertices):
                    coords = {key: finite(vertex.get(key)) for key in ("x", "y", "u", "v")}
                    xy.append([coords["x"], coords["y"]]);uv.append([coords["u"], coords["v"]])
                    if not 0 <= coords["u"] <= 1 or not 0 <= coords["v"] <= 1:
                        metrics["uv_out_of_range_count"] += 1
                        require(False, "uv_out_of_range", layer=name, vertex=index)
                    if index < len(layer["vertices"]):
                        declared = layer["vertices"][index]
                        require(all(abs(coords[key] - finite(declared[key])) < 1e-9 for key in coords),
                                "vertex_manifest_mismatch", layer=name, vertex=index)
                    weights = [n for n in vertex if n.tag == "Weight"]
                    require(len(weights) == 1, "vertex_weight_count_mismatch", layer=name, vertex=index)
                    if len(weights) != 1:
                        continue
                    selectors = int(weights[0].get("indices"));packed = int(weights[0].get("values"))
                    require(0 <= selectors <= 0xffffffff and 0 <= packed <= 0xffffffff,
                            "weight_uint32_out_of_range", layer=name, vertex=index)
                    decoded = []
                    for slot in range(4):
                        selector, value = (selectors >> (8 * slot)) & 255, (packed >> (8 * slot)) & 255
                        if selector == 0:
                            require(value == 0, "weight_on_unused_slot", layer=name, vertex=index)
                        else:
                            require(1 <= selector <= len(tendon_names), "weight_tendon_index_out_of_range", layer=name, vertex=index)
                            if 1 <= selector <= len(tendon_names) and value:
                                decoded.append((selector - 1, value / 255))
                    require(1 <= len(decoded) <= 4 and len({s for s, _ in decoded}) == len(decoded),
                            "invalid_influence_count_or_duplicates", layer=name, vertex=index)
                    error = abs(sum(w for _, w in decoded) - 1)
                    metrics["weight_sum_error_max"] = max(metrics["weight_sum_error_max"], error)
                    require(error < 1e-12, "weight_sum_not_one", layer=name, vertex=index)
                    metrics["max_influences"] = max(metrics["max_influences"], len(decoded))
                    declared_weights = layer["vertices"][index]["weights"]
                    require(all(finite(v) >= 0 and key in rest for key, v in declared_weights.items()), "invalid_manifest_weights", layer=name)
                    total = sum(map(finite, declared_weights.values()))
                    require(total > 0, "zero_manifest_weight_sum", layer=name)
                    if total > 0:
                        actual_weights = {tendon_names[s]: w for s, w in decoded}
                        for bone in set(declared_weights) | set(actual_weights):
                            error = abs(actual_weights.get(bone, 0) - finite(declared_weights.get(bone, 0)) / total)
                            metrics["quantization_weight_error_max"] = max(metrics["quantization_weight_error_max"], error)
                            require(error <= 1 / 255 + 1e-12, "weight_quantization_mismatch", layer=name, vertex=index, bone=bone)
                    influences.append(decoded)
                seen_triangles = set()
                for triangle in triangles:
                    valid = len(set(triangle)) == 3 and all(0 <= n < len(vertices) for n in triangle)
                    require(valid, "invalid_triangle_indices", layer=name)
                    if not valid:
                        continue
                    key = tuple(sorted(triangle));require(key not in seen_triangles, "duplicate_triangle", layer=name)
                    seen_triangles.add(key)
                    for points, metric in ((xy, "degenerate_xy_triangles"), (uv, "degenerate_uv_triangles")):
                        if abs(triangle_area(points, triangle)) < 1e-12:
                            metrics[metric] += 1;require(False, metric, layer=name)
                if len(influences) != len(xy):
                    continue
                for frame, pose in sample_poses.items():
                    points = []
                    for point, decoded in zip(xy, influences):
                        mapped = [0.0, 0.0]
                        for selector, weight in decoded:
                            transformed = apply(pose[tendon_names[selector]]["matrix"], apply(inverse_bind[selector], point))
                            mapped = [a + weight * b for a, b in zip(mapped, transformed)]
                        points.append(mapped)
                        if frame == 0:
                            metrics["frame0_bind_identity_error_max"] = max(
                                metrics["frame0_bind_identity_error_max"], math.dist(point, mapped))
                    bbox = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
                    expected = next(p["bbox"] for p in layer_receipts[name]["cpu_quantized_weight_pose_samples"] if p["frame"] == frame)
                    metrics["sampled_pose_bbox_error_max"] = max(metrics["sampled_pose_bbox_error_max"], max(abs(a - b) for a, b in zip(bbox, expected)))
    require(metrics["frame0_bind_identity_error_max"] < 1e-6, "frame0_bind_identity_mismatch")
    require(metrics["sampled_pose_bbox_error_max"] < 1e-6, "sampled_pose_bbox_mismatch")
    for tag, key in (("Mesh", "mesh_count"), ("MeshVertex", "vertex_count"),
                     ("Tendon", "tendon_count")):
        require(after_counts[tag] == metrics[key], "unverified_mesh_component", tag=tag)
    require(after_counts["Weight"] == metrics["vertex_count"], "weight_vertex_global_count_mismatch")
    require(after_counts["Skin"] == metrics["mesh_count"], "skin_mesh_global_count_mismatch")
    result = {"status": "pass" if not errors else "fail", "scope": "Independent XML/manifest/PNG metadata and numerical skin checks; no native playback, visual approval, medical safety, or all-BJJ-motion claim",
        "artboards": boards, "mesh_metrics": metrics, "image_assets": image_records,
        "new_tags": sorted(added_tags), "error_count": len(errors), "errors": errors[:30],
        "input_snapshots": {name: {"path": str(paths[name].resolve()), "bytes": len(body), "sha256": sha(body)} for name, body in raw.items()},
        "original_input_hashes_unchanged": {name: sha(raw[name]) == expected for name, expected in EXPECTED.items()},
        "native_and_visual_verification": "outside this checker; build receipt is source_generated, parent performs native review",
        "verifier_sha256": sha(Path(__file__).read_bytes())}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".json.tmp");temporary.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n");temporary.replace(output)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--output", type=Path, default=Path("/Users/brownjeon/.codex/artifacts/bjj-t064/skin-v2/skin-independent-verification.json"))
    args = parser.parse_args()
    try:
        result = verify(args.base.resolve(), args.output)
    except (ValueError, KeyError, TypeError, OSError, ET.ParseError) as error:
        result = {"status": "incomplete", "error_type": type(error).__name__, "error": str(error)}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "artboards": result.get("artboards"),
        "mesh_metrics": result.get("mesh_metrics"), "error_count": result.get("error_count"),
        "errors": result.get("errors", result.get("error")), "report": str(args.output)}, ensure_ascii=False))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

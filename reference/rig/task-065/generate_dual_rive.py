#!/usr/bin/env python3
"""Write an explicitly supplied two-character plan onto the fixed task-064 rig.

This is a generic source writer, not a tripod-motion planner. It has no default
plan or expanded profile. Native mirror/skinning behavior needs a runtime test.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import struct
import sys
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
BASE = HERE.parent / "task-064"
BASE_PROFILE_SHA = "ce9e93d2c1a2d637a59d3d20b8dafe57f42671ed103ccfae9ab99a24e6dd50f8"
BASE_TIMELINE_SHA = "72f1570e147a16954fbb8201b133f59589f21021cf6d64c2f167a0be408faa96"
CHARACTER_ORDER = ("white", "blue")
STATIC_CONTACT_DRAW_RULES = (
    ("blue:foot-far", "white:leg-far", "before"),
    ("blue:leg-far", "white:leg-near", "before"),
    ("white:foot-near", "blue:jacket-belt", "after"),
)
CLOTH_LAYERS = {"jacket-belt", "leg-far", "leg-near", "sleeve-far", "sleeve-near"}
SINGULAR_DETERMINANT_TOLERANCE = 1e-6
FLOOR_COORDINATE_TOLERANCE = 1e-9


def digest(data):
    return hashlib.sha256(data).hexdigest()


def number(value, label):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(label + " must be a finite JSON number")
    return float(value)


def absolute_file(value, label):
    path = Path(value)
    if not path.is_absolute():
        raise ValueError(label + " must be an absolute path")
    return path.resolve(strict=True)


def module_at(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def atomic_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def static_contact_draw_order(layers):
    """Reorder drawables only; preserve every node, transform and mesh value."""
    ordered = list(layers)
    for moving_name, anchor_name, position in STATIC_CONTACT_DRAW_RULES:
        moving = [n for n in ordered if n.tag == "Image" and n.get("name") == moving_name]
        anchors = [n for n in ordered if n.tag == "Image" and n.get("name") == anchor_name]
        if len(moving) != 1 or len(anchors) != 1:
            raise ValueError("Static hook draw order requires one Image named "
                             + moving_name + " and " + anchor_name)
        ordered.remove(moving[0])
        ordered.insert(ordered.index(anchors[0]) + (1 if position == "after" else 0), moving[0])
    if sorted(map(id, ordered)) != sorted(map(id, layers)):
        raise ValueError("Static contact ordering lost or duplicated a drawable")
    images = [node for node in ordered if node.tag == "Image"]
    if not images or images[-1].get("name") != "blue:hand-near":
        raise ValueError("Blue near gripping hand must remain the frontmost Image")
    return ordered


def check_profile(profile, baseline):
    bones = profile.get("bones")
    if not isinstance(bones, list) or len(bones) != 16:
        raise ValueError("The selected profile must contain the original sixteen bones")
    actual = {b["name"]: b for b in bones}
    original = {b["name"]: b for b in baseline["bones"]}
    if len(actual) != 16 or set(actual) != set(original):
        raise ValueError("Selected profile changes the original bone names")
    if profile.get("scale", [1, 1]) != [1, 1] or profile.get("bind_offset", [0, 0]) != [0, 0]:
        raise ValueError("Bone scales and bind offsets must remain unit/zero")
    for name, bone in actual.items():
        for key in ("parent", "length"):
            if bone[key] != original[name][key]:
                raise ValueError("Selected profile changes bone " + name + "." + key)
        bounds = bone["local_bounds_deg"]
        if len(bounds) != 2 or number(bounds[0], "lower bound") > number(bounds[1], "upper bound"):
            raise ValueError("Invalid declared range for " + name)
        if bone.get("scale", [1, 1]) != [1, 1] or bone.get("bind_offset", [0, 0]) != [0, 0]:
            raise ValueError("Animated or non-unit bone geometry is not supported")
    if actual["pelvis"]["parent"] is not None or actual["pelvis"]["length"] != 0:
        raise ValueError("Pelvis must remain the zero-length root bone")
    return actual


def check_plan(plan, bones):
    if plan.get("schema_version") != 1:
        raise ValueError("Unsupported plan schema")
    for name in ("width", "height", "fps", "duration_frames"):
        if type(plan.get(name)) is not int or plan[name] <= 0:
            raise ValueError(name + " must be a positive integer")
    if plan["fps"] != 24:
        raise ValueError("This writer preserves the original 24fps key contract")
    floor = number(plan["floor_y"], "floor_y")
    if not 0 <= floor <= plan["height"]:
        raise ValueError("Floor must lie inside the artboard")
    if set(plan.get("characters", {})) != set(CHARACTER_ORDER):
        raise ValueError("Plan must declare exactly white and blue characters")
    for character in CHARACTER_ORDER:
        spec = plan["characters"][character]
        required_mirror = -1 if character == "white" else 1
        if spec.get("mirror") != required_mirror:
            raise ValueError(character + " mirror must be the constant " + str(required_mirror))
        if not re.fullmatch(r"[0-9A-Fa-f]{8}", spec.get("rig_color", "")):
            raise ValueError("rig_color must be an eight-digit ARGB string")
    frames = plan.get("frames")
    if not isinstance(frames, list) or len(frames) != plan["duration_frames"] + 1:
        raise ValueError("Every frame from zero through duration is required")
    for index, frame in enumerate(frames):
        if frame.get("frame") != index or set(frame.get("characters", {})) != set(CHARACTER_ORDER):
            raise ValueError("Missing, unordered or extra character frame")
        for character in CHARACTER_ORDER:
            state = frame["characters"][character]
            if set(state) != {"root", "orientation_rad", "rotations_rad"}:
                raise ValueError("Only character root/orientation and bone rotations may be keyed")
            if not isinstance(state["root"], list) or len(state["root"]) != 2:
                raise ValueError("Character root must contain two coordinates")
            for coordinate in state["root"]:
                number(coordinate, "root coordinate")
            number(state["orientation_rad"], "orientation_rad")
            rotations = state["rotations_rad"]
            if set(rotations) != set(bones):
                raise ValueError("Every frame requires exactly sixteen local bone rotations")
            for name, value in rotations.items():
                angle = number(value, name + " rotation")
                lower, upper = [math.radians(x) for x in bones[name]["local_bounds_deg"]]
                if not lower - 1e-10 <= angle <= upper + 1e-10:
                    raise ValueError(f"{character}/{name} frame {index} exceeds the supplied profile")
                if name == "pelvis" and angle != 0:
                    raise ValueError("Pelvis local rotation must stay exactly zero")
                if index and abs(angle - frames[index - 1]["characters"][character]["rotations_rad"][name]) >= math.pi:
                    raise ValueError("Ambiguous local rotation wrap between consecutive keys")
            if index and abs(state["orientation_rad"] - frames[index - 1]["characters"][character]["orientation_rad"]) >= math.pi:
                raise ValueError("Ambiguous character orientation wrap between consecutive keys")


def read_layers(manifest_path, bone_names):
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw)
    layers = manifest.get("layers")
    if not isinstance(layers, list) or len(layers) != 10:
        raise ValueError("Each character requires exactly ten prepared PNG layers")
    names, prepared = set(), []
    for index, declared in enumerate(layers):
        layer = dict(declared)
        name = layer["name"]
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", name) or name in names:
            raise ValueError("Layer names must be unique safe file-name components")
        names.add(name)
        source = (manifest_path.parent / layer["file"]).resolve(strict=True)
        if not source.is_relative_to(manifest_path.parent):
            raise ValueError("PNG path must stay inside its source project")
        image = source.read_bytes()
        if image[:8] != b"\x89PNG\r\n\x1a\n" or image[12:16] != b"IHDR":
            raise ValueError("Prepared image is not a PNG")
        size = struct.unpack(">II", image[16:24])
        if tuple(size) != (layer["width"], layer["height"]) or min(size) <= 0:
            raise ValueError("Prepared PNG dimensions disagree with its manifest")
        vertices, triangles = layer["vertices"], layer["triangles"]
        if not isinstance(vertices, list) or len(vertices) < 3 or not triangles:
            raise ValueError("Every layer requires mesh vertices and triangles")
        for vertex in vertices:
            for key in ("x", "y", "u", "v"):
                number(vertex[key], "vertex " + key)
            if not 0 <= vertex["u"] <= 1 or not 0 <= vertex["v"] <= 1:
                raise ValueError("Mesh UV must be normalized to 0..1")
            weights = vertex.get("weights")
            if not isinstance(weights, dict) or set(weights) - set(bone_names):
                raise ValueError("Unknown or missing weighted bone")
            if any(number(w, "weight") < 0 for w in weights.values()):
                raise ValueError("Negative mesh weight")
        for triangle in triangles:
            if len(triangle) != 3 or len(set(triangle)) != 3 or any(
                    type(i) is not int or not 0 <= i < len(vertices) for i in triangle):
                raise ValueError("Invalid triangle indices")
        layer.update(_bytes=image, _source=str(source), _sha256=digest(image), _index=index)
        layer["order"] = number(layer.get("order", index), "layer order")
        prepared.append(layer)
    return sorted(prepared, key=lambda layer: (layer["order"], layer["_index"])), raw


def check_bind(profile, first):
    """Independently recompute original global bind matrices, without mirror."""
    poses = {}
    for spec in profile["bones"]:
        name, parent = spec["name"], spec["parent"]
        if parent is not None and parent not in poses:
            raise ValueError("Profile must preserve parent-before-child bone order")
        origin = poses[parent]["tip"] if parent else [first["root"]["x"], first["root"]["y"]]
        angle = first["local_rotations_rad"][name] + (poses[parent]["angle"] if parent else 0)
        c, s = math.cos(angle), math.sin(angle)
        pose = {"origin": list(origin), "tip": [origin[0] + spec["length"] * c,
            origin[1] + spec["length"] * s], "angle": angle,
            "matrix": {"xx": c, "xy": s, "yx": -s, "yy": c, "tx": origin[0], "ty": origin[1]}}
        old = first["bones"][name]
        if math.dist(old["origin"], pose["origin"]) > 1e-8 or math.dist(old["tip"], pose["tip"]) > 1e-8:
            raise ValueError("Original bind timeline does not match fixed topology")
        poses[name] = pose
    return poses


def affine_product(left, right):
    """Composition in Rive xx,xy,yx,yy,tx,ty order (left after right)."""
    a, b, c, d, x, y = left
    e, f, g, h, u, v = right
    return (a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h,
            a * u + c * v + x, b * u + d * v + y)


def affine_inverse(matrix):
    a, b, c, d, x, y = matrix
    determinant = a * d - b * c
    # A reflected character has a negative, valid determinant. Only magnitude
    # determines singularity; never disable this check or silently skip a case.
    if not math.isfinite(determinant) or abs(determinant) < SINGULAR_DETERMINANT_TOLERANCE:
        raise ValueError("Singular skin affine (abs determinant < 1e-6)")
    return (d / determinant, -b / determinant, -c / determinant, a / determinant,
            (c * y - d * x) / determinant, (b * x - a * y) / determinant)


def pose_skin_affines(profile, state, mirror, inverse_binds):
    orientation = state["orientation_rad"]
    c, s = math.cos(orientation), math.sin(orientation)
    actor = (c * mirror, s * mirror, -s, c, state["root"][0], state["root"][1])
    world, result = {}, {}
    lengths = {bone["name"]: bone["length"] for bone in profile["bones"]}
    for bone in profile["bones"]:
        name, parent = bone["name"], bone["parent"]
        prefix = actor if parent is None else affine_product(
            world[parent], (1, 0, 0, 1, lengths[parent], 0))
        angle = state["rotations_rad"][name]
        c, s = math.cos(angle), math.sin(angle)
        world[name] = affine_product(prefix, (c, s, -s, c, 0, 0))
        result[name] = affine_product(world[name], inverse_binds[name])
    return result


def project_rest_vertex_to_floor(point, affine, floor_y):
    """Change world y alone, then invert the same quantized LBS affine."""
    a, b, c, d, tx, ty = affine
    determinant = a * d - b * c
    if not math.isfinite(determinant) or abs(determinant) < SINGULAR_DETERMINANT_TOLERANCE:
        raise ValueError("Singular weighted skin affine (abs determinant < 1e-6)")
    x, y = point
    world_x, world_y = a * x + c * y + tx, b * x + d * y + ty
    if not all(math.isfinite(v) for v in (world_x, world_y)):
        raise ValueError("Non-finite deformed vertex")
    compression = max(0.0, world_y - floor_y)
    if compression <= FLOOR_COORDINATE_TOLERANCE:
        return point, world_x, world_y, 0.0, 0.0
    # A^-1 * (0, floor_y - world_y). Root/mirror/rotation are all already in A.
    delta_y = floor_y - world_y
    corrected = (x - c * delta_y / determinant, y + a * delta_y / determinant)
    reconstructed_x = a * corrected[0] + c * corrected[1] + tx
    reconstructed_y = b * corrected[0] + d * corrected[1] + ty
    error = max(abs(reconstructed_x - world_x), abs(reconstructed_y - floor_y))
    if not all(math.isfinite(v) for v in corrected) or error > 1e-6:
        raise ValueError("Cloth inverse projection did not preserve world x/floor y")
    return corrected, world_x, world_y, compression, error


def consecutive_ranges(values):
    result = []
    for value in sorted(values):
        if result and value == result[-1][1] + 1:
            result[-1][1] = value
        else:
            result.append([value, value])
    return result


def prepare_cloth_floor_keys(profile, plan, characters, rest, skin_module):
    """One vertex/frame scan, once per character; never duplicated per board.

    Only changed cloth vertices keep trajectories. Their earlier unchanged
    history is the constant original rest coordinate, so no dense V*F table
    is needed for vertices that never touch the floor.
    """
    inverse_binds = {name: affine_inverse(tuple(pose["matrix"][key]
        for key in ("xx", "xy", "yx", "yy", "tx", "ty"))) for name, pose in rest.items()}
    floor = plan["floor_y"]
    result = {"status": "source_computed", "floor_y": floor,
        "cloth_layer_allowlist": sorted(CLOTH_LAYERS),
        "method": "quantized LBS A=sum(w*worldPose*inverseOriginalBind); project world y to floor preserving world x; apply inverse(A) to rest xy",
        "singular_fail_condition": "abs(det(A)) < 1e-6; negative determinants from mirror are valid",
        "bone_pose_profile_png_uv_weights_changed": False,
        "opaque_mask_or_floor_cover_added": False,
        "native_mesh_vertex_xy_keys_verified": False,
        "measurement_scope": "Mesh vertices including transparent image margins; not rendered alpha silhouettes",
        "between_frame_floor_contact": "not_verified; linear vertex keys and nonlinear joint FK may leave small inter-key residuals",
        "changed_vertices_total": 0, "changed_vertex_frames_total": 0,
        "maximum_world_compression_px": 0.0, "maximum_rest_delta_px": 0.0,
        "maximum_abs_key_coordinate_px": 0.0, "projection_error_max_px": 0.0,
        "minimum_abs_affine_determinant": float("inf"), "characters": {}}
    for character in CHARACTER_ORDER:
        mirror = plan["characters"][character]["mirror"]
        pose_affines = [pose_skin_affines(profile, frame["characters"][character], mirror, inverse_binds)
            for frame in plan["frames"]]
        character_result = {"cloth_layers": [], "protected_layers_report_only": []}
        for layer in characters[character]:
            is_cloth = layer["name"] in CLOTH_LAYERS
            tendon_names = [bone["name"] for bone in profile["bones"] if any(
                vertex["weights"].get(bone["name"], 0) > 0 for vertex in layer["vertices"])]
            if not 1 <= len(tendon_names) <= 32:
                raise ValueError("Unexpected tendon count in cloth preparation")
            packed = [skin_module.pack_weights(vertex["weights"], tendon_names) for vertex in layer["vertices"]]
            layer["_tendon_names"], layer["_packed_weights"] = tendon_names, packed
            groups = [tuple((name, weight) for name, weight in entry[2]) for entry in packed]
            animated, changes, affected_frames, affected_vertices = {}, {}, set(), set()
            layer_result = {"name": layer["name"], "cloth_corrected": is_cloth,
                "penetrating_vertex_frames": 0, "maximum_world_compression_px": 0.0,
                "maximum_rest_delta_px": 0.0, "maximum_abs_key_coordinate_px": 0.0,
                "projection_error_max_px": 0.0}
            for frame_index, transforms in enumerate(pose_affines):
                cache = {}
                for vertex_index, (vertex, group) in enumerate(zip(layer["vertices"], groups)):
                    affine = cache.get(group)
                    if affine is None:
                        affine = tuple(sum(weight * transforms[name][i] for name, weight in group) for i in range(6))
                        cache[group] = affine
                        determinant = abs(affine[0] * affine[3] - affine[1] * affine[2])
                        result["minimum_abs_affine_determinant"] = min(result["minimum_abs_affine_determinant"], determinant)
                        if not math.isfinite(determinant) or determinant < SINGULAR_DETERMINANT_TOLERANCE:
                            raise ValueError(f"Singular weighted affine: {character}/{layer['name']} frame {frame_index}")
                    original = (vertex["x"], vertex["y"])
                    if is_cloth:
                        corrected, _, world_y, compression, error = project_rest_vertex_to_floor(original, affine, floor)
                    else:
                        world_y = affine[1] * original[0] + affine[3] * original[1] + affine[5]
                        corrected, compression, error = original, max(0.0, world_y - floor), 0.0
                        if not math.isfinite(world_y):
                            raise ValueError("Non-finite protected-layer vertex")
                    if compression > FLOOR_COORDINATE_TOLERANCE:
                        layer_result["penetrating_vertex_frames"] += 1
                        layer_result["maximum_world_compression_px"] = max(layer_result["maximum_world_compression_px"], compression)
                        affected_frames.add(frame_index);affected_vertices.add(vertex_index)
                        if is_cloth:
                            newly_animated = vertex_index not in animated
                            needs_unchanged_prefix = frame_index > 0 and newly_animated
                            if newly_animated:
                                animated[vertex_index] = [original] * frame_index
                            trajectory = animated[vertex_index]
                            trajectory.append(corrected)
                            if needs_unchanged_prefix:
                                layer_result["maximum_abs_key_coordinate_px"] = max(
                                    layer_result["maximum_abs_key_coordinate_px"], abs(original[0]), abs(original[1]))
                            entry = changes.setdefault(vertex_index, {"index": vertex_index, "frames": [],
                                "maximum_world_compression_px": 0.0, "maximum_rest_delta_px": 0.0})
                            entry["frames"].append(frame_index)
                            entry["maximum_world_compression_px"] = max(entry["maximum_world_compression_px"], compression)
                            delta = math.dist(original, corrected)
                            entry["maximum_rest_delta_px"] = max(entry["maximum_rest_delta_px"], delta)
                            layer_result["maximum_rest_delta_px"] = max(layer_result["maximum_rest_delta_px"], delta)
                            layer_result["projection_error_max_px"] = max(layer_result["projection_error_max_px"], error)
                    elif is_cloth and vertex_index in animated:
                        animated[vertex_index].append(original)
                    if is_cloth and vertex_index in animated:
                        layer_result["maximum_abs_key_coordinate_px"] = max(
                            layer_result["maximum_abs_key_coordinate_px"], abs(corrected[0]), abs(corrected[1]))
            layer["_cloth_vertex_keys"] = animated
            if any(len(keys) != len(plan["frames"]) for keys in animated.values()):
                raise ValueError("Incomplete cloth-vertex key history")
            layer_result.update(affected_vertex_indices=sorted(affected_vertices),
                affected_frame_ranges=consecutive_ranges(affected_frames))
            if is_cloth:
                for entry in changes.values():
                    entry["frame_ranges"] = consecutive_ranges(entry.pop("frames"))
                layer_result.update(changed_vertices=len(animated),
                    vertex_property_keys_per_artboard=2 * len(animated) * len(plan["frames"]),
                    vertices=list(changes.values()))
                character_result["cloth_layers"].append(layer_result)
                result["changed_vertices_total"] += len(animated)
                result["changed_vertex_frames_total"] += layer_result["penetrating_vertex_frames"]
                for key in ("maximum_world_compression_px", "maximum_rest_delta_px", "maximum_abs_key_coordinate_px", "projection_error_max_px"):
                    result[key] = max(result[key], layer_result[key])
            else:
                layer_result["maximum_world_penetration_px"] = layer_result.pop("maximum_world_compression_px")
                layer_result["correction_applied"] = False
                character_result["protected_layers_report_only"].append(layer_result)
        result["characters"][character] = character_result
    return result


def build(plan_path, output):
    if not plan_path.is_absolute() or not output.is_absolute():
        raise ValueError("--plan and --output must be absolute paths")
    plan_path = plan_path.resolve(strict=True)
    output = output.resolve()
    if not output.is_relative_to(HERE) or output == HERE or output.is_relative_to(HERE / "white-character"):
        raise ValueError("Output must be a dedicated task-065 project, outside original source assets")
    plan_bytes = plan_path.read_bytes();plan = json.loads(plan_bytes)
    profile_path = absolute_file(plan["profile_file"], "profile_file")
    bind_path = absolute_file(plan["bind_timeline_file"], "bind_timeline_file")
    baseline_bytes = (BASE / "rig_profile.json").read_bytes()
    profile_bytes = profile_path.read_bytes();profile = json.loads(profile_bytes)
    bind_bytes = bind_path.read_bytes();bind = json.loads(bind_bytes)
    if digest(baseline_bytes) != BASE_PROFILE_SHA or digest(bind_bytes) != BASE_TIMELINE_SHA:
        raise ValueError("Original profile or bind timeline SHA changed")
    bones = check_profile(profile, json.loads(baseline_bytes))
    check_plan(plan, bones)
    rest = check_bind(profile, bind["frames"][0])
    source_path = BASE / "generate_character.py"
    skin_path = BASE / "skin-v2/generate_skin.py"
    source_bytes, skin_bytes = source_path.read_bytes(), skin_path.read_bytes()
    drawing_module = module_at(source_path, "task064_dual_drawing_helpers")
    skin_module = module_at(skin_path, "task064_dual_skin_helpers")
    characters, asset_inputs = {}, {}
    for character in CHARACTER_ORDER:
        manifest = absolute_file(plan["characters"][character]["assets_manifest"], "assets_manifest")
        if output == manifest.parent or manifest.parent.is_relative_to(output):
            raise ValueError("Output must not contain an original source manifest")
        layers, manifest_bytes = read_layers(manifest, bones)
        characters[character] = layers
        asset_inputs[character] = {"manifest": str(manifest), "manifest_sha256": digest(manifest_bytes),
            "layers": [{"name": x["name"], "source": x["_source"], "sha256": x["_sha256"],
                "bytes": len(x["_bytes"]), "output_file": f"assets/{character}-{x['name']}.png"} for x in layers]}
    cloth_floor_receipt = prepare_cloth_floor_keys(profile, plan, characters, rest, skin_module)
    output.mkdir(parents=True, exist_ok=True)
    for character in CHARACTER_ORDER:
        for layer in characters[character]:
            target = output / "assets" / f"{character}-{layer['name']}.png"
            if not target.resolve().is_relative_to(output):
                raise ValueError("Output asset symlink escapes the dedicated project")
            atomic_bytes(target, layer["_bytes"])

    class DualDrawing(drawing_module.Drawing):
        def __init__(self):
            super().__init__(profile)
            self.asset_ids, self.board_receipts = {}, []
            self.max_rest_error = 0.0
            for character in CHARACTER_ORDER:
                for layer in characters[character]:
                    asset = self.node(self.root, "ImageAsset", character + ":" + layer["name"] + " texture",
                        file=f"assets/{character}-{layer['name']}.png")
                    self.asset_ids[(character, layer["name"])] = asset.get("id")

        def character(self, board, character, rig):
            spec = plan["characters"][character]
            first = plan["frames"][0]["characters"][character]
            transform = self.node(board, "Node", character + ":CharacterTransform",
                x=first["root"][0], y=first["root"][1], rotation=first["orientation_rad"],
                scaleX=spec["mirror"], scaleY=1)
            native_bones = {}
            for bone in profile["bones"]:
                name, parent = bone["name"], bone["parent"]
                attrs = {"length": bone["length"], "rotation": first["rotations_rad"][name]}
                if parent is None:
                    attrs.update(x=0, y=0, rotation=0)
                node = self.node(transform if parent is None else native_bones[parent],
                    "RootBone" if parent is None else "Bone", character + ":" + name, **attrs)
                lower, upper = map(math.radians, bone["local_bounds_deg"])
                self.node(node, "RotationConstraint", character + ":" + name + " local range",
                    doesCopy="false", min="true", max="true", minValue=lower, maxValue=upper,
                    minMaxSpaceValue="local", strength=1)
                native_bones[name] = node
            layer_receipts, cloth_targets = [], []
            for layer in characters[character]:
                name = character + ":" + layer["name"]
                image = self.node(board, "Image", name, assetId=self.asset_ids[(character, layer["name"])],
                    x=0, y=0, originX=0, originY=0, scaleX=1, scaleY=1)
                self.layers.append(image)
                tendons = layer["_tendon_names"]
                if not 1 <= len(tendons) <= 32:
                    raise ValueError("Unexpected tendon count")
                indices = bytearray()
                for triangle in layer["triangles"]:
                    for index in triangle:
                        indices.extend(skin_module.varuint(index))
                mesh = self.node(image, "Mesh", name + " mesh", triangleIndexBytes=base64.b64encode(indices).decode())
                max_influences = 0
                for index, vertex in enumerate(layer["vertices"]):
                    coordinates = {k: vertex[k] for k in ("x", "y", "u", "v")}
                    cloth_keys = layer["_cloth_vertex_keys"].get(index)
                    if cloth_keys is not None:
                        coordinates["x"], coordinates["y"] = cloth_keys[0]
                    node = self.node(mesh, "MeshVertex", "Vertex " + str(index),
                        **coordinates)
                    if cloth_keys is not None:
                        cloth_targets.append((node, cloth_keys))
                    selectors, weights, decoded = layer["_packed_weights"][index]
                    drawing_module.add(node, "Weight", indices=selectors, values=weights)
                    max_influences = max(max_influences, len(decoded))
                    # This is a bind identity check, not native mirror validation.
                    mapped = skin_module.deform(vertex, decoded, bind["frames"][0]["bones"], bind["frames"][0]["bones"])
                    self.max_rest_error = max(self.max_rest_error, math.dist(mapped, [vertex["x"], vertex["y"]]))
                skin = self.node(mesh, "Skin", name + " skin", xx=1, xy=0, yx=0, yy=1, tx=0, ty=0)
                for bone in tendons:
                    self.node(skin, "Tendon", character + ":" + bone + " original global rest",
                        boneId=native_bones[bone].get("id"), **rest[bone]["matrix"])
                layer_receipts.append({"name": layer["name"], "vertices": len(layer["vertices"]),
                    "triangles": len(layer["triangles"]), "tendons": tendons, "max_influences": max_influences,
                    "cloth_animated_vertices": len(layer["_cloth_vertex_keys"])})
            cloth_key_count = 2 * len(cloth_targets) * len(plan["frames"])
            return transform, native_bones, cloth_targets, {"character": character, "bones": 16, "constraints": 16,
                "meshes": len(layer_receipts), "bone_rotation_keys": 16 * len(plan["frames"]),
                "parent_transform_keys": 3 * len(plan["frames"]),
                "cloth_animated_vertices": len(cloth_targets), "cloth_vertex_keys": cloth_key_count,
                "total_keys": 19 * len(plan["frames"]) + cloth_key_count, "mirror": spec["mirror"],
                "root_bone_local": {"x": 0, "y": 0, "rotation": 0},
                "parent_transform_frame0": {"root": first["root"], "orientation_rad": first["orientation_rad"],
                    "scaleX": spec["mirror"], "scaleY": 1}, "layers": layer_receipts}

        def dual_board(self, name, rig, x):
            board = self.node(self.root, "Artboard", name, width=plan["width"], height=plan["height"], originX=0, originY=0, x=x)
            style = self.node(board, "LayoutComponentStyle", "Canvas style");board.set("styleId", style.get("id"))
            fill = self.node(board, "Fill", "Background");self.node(fill, "SolidColor", "Background paint", colorValue="FFF2F4F7")
            self.layers = []
            floor = plan["floor_y"]
            self.rect(board, "Mat", plan["width"] / 2, (floor + plan["height"]) / 2,
                plan["width"] - 80, max(1, plan["height"] - floor), "FFD8E0E9", 12)
            self.line(board, "Floor line", [(40, floor), (plan["width"] - 40, floor)], "FFBAC7D6", 2)
            targets, counts = {}, []
            for character in CHARACTER_ORDER:
                transform, native_bones, cloth_targets, count = self.character(board, character, rig)
                targets[character] = (transform, native_bones, cloth_targets);counts.append(count)
            if rig:
                for character, (_, native_bones, _) in targets.items():
                    color = plan["characters"][character]["rig_color"]
                    for bone in profile["bones"]:
                        node = native_bones[bone["name"]]
                        self.line(node, character + ":" + bone["name"] + " axis", [(0, 0), (bone["length"], 0)], color, 3)
                        self.ellipse(node, character + ":" + bone["name"] + " pivot", 0, 0, 9, 9, color)
            self.layers = static_contact_draw_order(self.layers)
            image_draw_order = [node.get("name") for node in self.layers if node.tag == "Image"]
            for previous, current in zip(self.layers, self.layers[1:]):
                self.draw_in_front(current, previous.get("id"))
            animation = self.node(board, "LinearAnimation", "Dual character sample", fps=24,
                duration=plan["duration_frames"], loopValue="oneShot")
            for character, (transform, native_bones, cloth_targets) in targets.items():
                keyed_targets = [(transform, ("x", "y", "rotation"), None)]
                keyed_targets.extend((native_bones[n], ("rotation",), n) for n in bones)
                for target, properties, bone in keyed_targets:
                    keyed = drawing_module.add(animation, "KeyedObject", objectId=target.get("id"))
                    for property_name in properties:
                        prop = drawing_module.add(keyed, "KeyedProperty", property=property_name)
                        for frame in plan["frames"]:
                            state = frame["characters"][character]
                            value = state["rotations_rad"][bone] if bone else (
                                state["orientation_rad"] if property_name == "rotation" else state["root"][0 if property_name == "x" else 1])
                            drawing_module.add(prop, "KeyFrameDouble", frame=frame["frame"], value=repr(value), interpolationType="linear")
                for vertex, trajectory in cloth_targets:
                    keyed = drawing_module.add(animation, "KeyedObject", objectId=vertex.get("id"))
                    for component, property_name in enumerate(("x", "y")):
                        prop = drawing_module.add(keyed, "KeyedProperty", property=property_name)
                        for frame, coordinate in zip(plan["frames"], trajectory):
                            drawing_module.add(prop, "KeyFrameDouble", frame=frame["frame"],
                                value=repr(coordinate[component]), interpolationType="linear")
            machine = self.node(board, "StateMachine", "Autoplay");board.set("defaultStateMachineId", machine.get("id"))
            layer = self.node(machine, "StateMachineLayer", "Motion")
            state = drawing_module.add(layer, "AnimationState", id=self.ident(), stateName="Dual motion", animationId=animation.get("id"), x=220, y=0)
            entry = drawing_module.add(layer, "EntryState", id=self.ident(), x=0, y=0)
            drawing_module.add(entry, "StateTransition", stateToId=state.get("id"))
            drawing_module.add(layer, "AnyState", id=self.ident(), x=0, y=120)
            drawing_module.add(layer, "ExitState", id=self.ident(), x=440, y=0)
            self.board_receipts.append({"name": name, "characters": counts,
                "bones": 32, "constraints": 32, "meshes": 20,
                "total_keys": sum(c["total_keys"] for c in counts),
                "image_draw_order_back_to_front": image_draw_order})

    drawing = DualDrawing()
    drawing.dual_board("Clean", False, 0)
    drawing.dual_board("Rig", True, plan["width"] + 100)
    if drawing.max_rest_error > 1e-6:
        raise ValueError("Original-global-bind identity check failed")
    ET.indent(drawing.root, space="  ")
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(drawing.root, encoding="unicode") + "\n").encode()
    atomic_bytes(output / "scene.rml", xml)
    atomic_bytes(output / "rive.yaml", b"name: bjj-dual-native-character-sample\nmain: Clean\noutput:\n  dir: build\n")
    receipt = {"schema_version": 1, "status": "source_generated", "generic_writer_only": True,
        "plan": {"path": str(plan_path), "sha256": digest(plan_bytes)},
        "profile": {"path": str(profile_path), "sha256": digest(profile_bytes), "selection": "explicit plan path; no automatic expanded-profile selection"},
        "original_profile_sha256": digest(baseline_bytes),
        "bind_timeline": {"path": str(bind_path), "sha256": digest(bind_bytes), "frame": 0},
        "parent_source": {"path": str(source_path), "sha256": digest(source_bytes)},
        "skin_helper_source": {"path": str(skin_path), "sha256": digest(skin_bytes)},
        "writer_sha256": digest(Path(__file__).read_bytes()), "scene_sha256": digest(xml),
        "artboards": drawing.board_receipts, "asset_inputs": asset_inputs,
        "character_draw_order_back_to_front": list(CHARACTER_ORDER),
        "character_draw_order_scope": "Base character order before the explicit static hook-depth exceptions",
        "static_contact_draw_order": {
            "status": "source_applied_before_draw_chain",
            "rules": [{"moving_image": moving,
                       ("before_image_back_side" if position == "before" else "after_image_front_side"): anchor,
                       "position_in_back_to_front_array": position}
                      for moving, anchor, position in STATIC_CONTACT_DRAW_RULES],
            "intended_back_to_front_prefix": ["blue:foot-far", "white:leg-far", "white:foot-far",
                "blue:leg-far", "white:leg-near"],
            "controlled_near_foot": "white:foot-near immediately after blue:jacket-belt (front side)",
            "frontmost_image": "blue:hand-near",
            "bone_geometry_profile_png_changed": False,
            "native_visual_hook_depth_verified": False},
        "bone_geometry": "Original sixteen names/parents/lengths, unit scale, zero bind offset; local pelvis remains zero",
        "mesh_coordinates": "Original task-064 global frame-0 vertices; artboard-identity Image and Skin",
        "tendon_bind": "Original task-064 global frame-0 rest matrices including pelvis420,450; no mirror baked into bind",
        "max_original_bind_identity_error_px": drawing.max_rest_error,
        "cloth_floor_correction": cloth_floor_receipt,
        "interpolation": "Explicit native linear for every supplied frame; no bone scale/length/mirror keys",
        "contacts": "Plan metadata not interpreted or verified by this generic writer",
        "new_tools_or_models": False, "paid_api_calls": 0, "cloud_upload": False,
        "native_runtime_verified": False, "native_mirror_skin_behavior": "not_verified",
        "visual_quality": "not_reviewed", "technique_accuracy": "not_reviewed"}
    atomic_bytes(output / "dual-build-receipt.json", (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode())
    print(json.dumps({"status": receipt["status"], "output": str(output), "scene_sha256": receipt["scene_sha256"],
        "artboards": [{k: b[k] for k in ("name", "bones", "constraints", "meshes", "total_keys")} for b in drawing.board_receipts],
        "native_runtime_verified": False}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.plan, args.output)


if __name__ == "__main__":
    main()

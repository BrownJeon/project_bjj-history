#!/usr/bin/env python3
"""Independent 2D FK checks for task-064 JSON exports; standard library only.

Bounds describe this drawing's declared rig, not medical ranges or BJJ safety.
No generator import, native runtime, model loading, or service calls occur here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys


def point_distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def angle_distance(a, b):
    return abs(math.remainder(a - b, 2 * math.pi))


def local_point(origin, angle, offset):
    c, s = math.cos(angle), math.sin(angle)
    return [origin[0] + c * offset[0] - s * offset[1],
            origin[1] + s * offset[0] + c * offset[1]]


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def check_finite_tree(value, path="root"):
    if isinstance(value, dict):
        for key, child in value.items():
            check_finite_tree(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            check_finite_tree(child, f"{path}[{index}]")
    elif isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"Non-finite numeric value at {path}")


def forward_kinematics(bones, rotations, root):
    """Each child begins at its parent's tip; scales and offsets are unit/zero."""
    result = {}
    pending = set(bones)
    while pending:
        ready = sorted(name for name in pending if bones[name]["parent"] is None
                       or bones[name]["parent"] in result)
        if not ready:
            raise ValueError("Bone hierarchy contains a cycle or an unknown parent")
        for name in ready:
            bone = bones[name]
            parent = result.get(bone["parent"])
            origin = list(parent["tip"] if parent else root)
            angle = (parent["world_rotation_rad"] if parent else 0.0) + rotations[name]
            tip = local_point(origin, angle, [bone["length"], 0.0])
            result[name] = {"origin": origin, "tip": tip, "world_rotation_rad": angle}
            pending.remove(name)
    return result


def marker_curvature_bound(bones, first, second, foot_name, offset):
    """Bound ||d² marker/d u²|| for normalized linear interpolation u in [0,1].

    Linear root translation has zero second derivative. For a rotating vector
    of length L and cumulative angle change d, the bound is L*d*d. The sum
    therefore bounds all intermediate points without assuming sampled extrema.
    """
    chain = []
    name = foot_name
    while name is not None:
        chain.append(name)
        name = bones[name]["parent"]
    chain.reverse()
    cumulative_delta = 0.0
    result = 0.0
    for name in chain:
        cumulative_delta += second[name] - first[name]
        length = math.hypot(*offset) if name == foot_name else bones[name]["length"]
        result += length * cumulative_delta * cumulative_delta
    return result


class Issues:
    def __init__(self):
        self.counts = {}
        self.examples = {}

    def add(self, kind, **details):
        self.counts[kind] = self.counts.get(kind, 0) + 1
        examples = self.examples.setdefault(kind, [])
        if len(examples) < 8:
            examples.append(details)

    def as_dict(self):
        return {"counts": self.counts, "examples": self.examples}


def receipt_hierarchy(receipt):
    """Accept explicit name/parent/length entries; never infer a missing export."""
    for key in ("bones", "bone_hierarchy", "hierarchy"):
        value = receipt.get(key)
        if isinstance(value, list) and all(isinstance(x, dict) and "name" in x for x in value):
            return {x["name"]: x for x in value}
        if isinstance(value, dict) and all(isinstance(x, dict) for x in value.values()):
            return value
    return None


def verify(profile, timeline, receipt, args):
    for data in (profile, timeline, receipt):
        check_finite_tree(data)
    issues = Issues()
    entries = profile["bones"]
    bones = {entry["name"]: entry for entry in entries}
    if len(entries) != len(bones):
        raise ValueError("Profile contains duplicate bone names")
    if profile.get("scale", [1, 1]) != [1, 1] or profile.get("bind_offset", [0, 0]) != [0, 0]:
        raise ValueError("Independent FK requires the declared unit scale/zero bind offset contract")
    for name, bone in bones.items():
        if bone["parent"] is not None and bone["parent"] not in bones:
            raise ValueError(f"Unknown parent for {name}")
        if not finite_number(bone["length"]) or bone["length"] < 0:
            raise ValueError(f"Invalid length for {name}")
        bounds = bone["local_bounds_deg"]
        if len(bounds) != 2 or not all(finite_number(x) for x in bounds) or bounds[0] > bounds[1]:
            raise ValueError(f"Invalid local bounds for {name}")
        if bone.get("scale", [1, 1]) != [1, 1] or bone.get("offset", [0, 0]) != [0, 0]:
            raise ValueError("This independent checker requires unit scales and zero local offsets")

    frames = timeline["frames"]
    if len(frames) < 2:
        raise ValueError("At least two exported frames are required")
    interpolation = timeline.get("interpolation")
    if interpolation != "linear":
        raise ValueError(f"Continuous-bound proof requires explicit linear interpolation, got {interpolation!r}")
    exported_hierarchy = receipt_hierarchy(receipt)
    if exported_hierarchy is None:
        issues.add("receipt_hierarchy_missing")
    else:
        if set(exported_hierarchy) != set(bones):
            issues.add("hierarchy_mismatch", reason="bone names differ between profile and model receipt")
        for name in set(bones) & set(exported_hierarchy):
            actual = exported_hierarchy[name]
            for key in ("parent", "length", "local_bounds_deg", "bind_local_rotation_deg"):
                if actual.get(key) != bones[name][key]:
                    issues.add("hierarchy_mismatch", bone=name, field=key,
                               expected=bones[name][key], actual=actual.get(key))
            if actual.get("scale", [1, 1]) != [1, 1]:
                issues.add("scale_violation", bone=name, source="model_receipt")
            if actual.get("bind_offset", [0, 0]) != [0, 0]:
                issues.add("hierarchy_mismatch", bone=name, field="bind_offset")

    marker_offsets = profile.get("foot_markers_local")
    if not isinstance(marker_offsets, dict) or not marker_offsets:
        raise ValueError("Profile must explicitly declare foot_markers_local; no anatomical values are assumed")
    floor_y = profile["floor_y"]
    if not finite_number(floor_y) or timeline.get("floor_y") != floor_y:
        raise ValueError("Profile and timeline must declare the same finite floor_y")
    # The generator's side-to-bone naming contract is confirmed from its source;
    # numeric anchors and sole markers are read only from the supplied profile.
    foot_bones = profile.get("foot_bones") or {side: "foot_" + side for side in profile["stance_ankles"]}
    if not isinstance(foot_bones, dict) or not foot_bones:
        raise ValueError("Profile must declare foot_bones mapping contact side to bone name")
    for side, name in foot_bones.items():
        if name not in bones:
            raise ValueError(f"Foot bone {name!r} for side {side!r} is not in profile")

    metrics = {
        "bone_count": len(bones), "frame_count": len(frames),
        "interpolated_pose_count": 0, "bone_length_error_max": 0.0,
        "reported_fk_position_error_max": 0.0, "reported_fk_angle_error_rad_max": 0.0,
        "reported_marker_error_max": 0.0, "scale_error_max": 0.0,
        "limit_violation_count": 0, "limit_excess_deg_max": 0.0,
        "planted_foot_drift_sampled_max": 0.0,
        "planted_foot_drift_continuous_upper_bound_max": 0.0,
        "single_support_drift_max": 0.0, "double_support_drift_max": 0.0,
        "single_support_frame_count": 0, "double_support_frame_count": 0,
        "single_support_continuous_upper_bound_max": 0.0,
        "double_support_continuous_upper_bound_max": 0.0,
        "plant_continuity_segments": 0, "angle_delta_rad_max": 0.0,
        "sole_clearance_sampled_min": float("inf"),
        "sole_clearance_continuous_lower_bound_min": float("inf"),
    }
    if timeline.get("fps") != profile.get("fps") or timeline.get("duration_frames") != profile.get("duration_frames"):
        raise ValueError("Timeline and profile fps/duration disagree")
    if len(frames) != timeline["duration_frames"] + 1:
        raise ValueError("Timeline does not include every frame and both endpoints")
    per_stage = {}
    anchors = {}
    pose_data = []
    angle_tolerance = math.radians(args.angle_tolerance_deg)

    def check_pose(rotations, root, label):
        if set(rotations) != set(bones):
            raise ValueError(f"Rotation bone names differ at {label}")
        for name, angle in rotations.items():
            if not finite_number(angle):
                raise ValueError(f"Invalid rotation for {name} at {label}")
            lo, hi = map(math.radians, bones[name]["local_bounds_deg"])
            excess = max(lo - angle, angle - hi, 0.0)
            metrics["limit_excess_deg_max"] = max(metrics["limit_excess_deg_max"], math.degrees(excess))
            if excess > angle_tolerance:
                issues.add("joint_limit_violation", pose=label, bone=name,
                           angle_deg=math.degrees(angle), bounds_deg=bones[name]["local_bounds_deg"])
                metrics["limit_violation_count"] += 1
        fk = forward_kinematics(bones, rotations, root)
        for name, transform in fk.items():
            error = abs(point_distance(transform["origin"], transform["tip"]) - bones[name]["length"])
            metrics["bone_length_error_max"] = max(metrics["bone_length_error_max"], error)
            if error > args.length_tolerance:
                issues.add("bone_length_violation", pose=label, bone=name, error=error)
        for side, name in foot_bones.items():
            for marker, offset in marker_offsets.items():
                position = local_point(fk[name]["origin"], fk[name]["world_rotation_rad"], offset)
                clearance = floor_y - position[1]
                metrics["sole_clearance_sampled_min"] = min(metrics["sole_clearance_sampled_min"], clearance)
                if clearance < -args.contact_tolerance:
                    issues.add("sole_floor_penetration", pose=label, side=side, marker=marker, penetration=-clearance)
        return fk

    for index, frame in enumerate(frames):
        if frame["frame"] != index or abs(frame["time_seconds"] - index / timeline["fps"]) > 1e-10:
            raise ValueError("Frame index/time does not match the declared fixed-rate export")
        if index and frame["time_seconds"] <= frames[index - 1]["time_seconds"]:
            raise ValueError("Frame times must be strictly increasing")
        rotations = frame["local_rotations_rad"]
        if index == 0:
            for name in bones:
                expected_bind = math.radians(bones[name]["bind_local_rotation_deg"])
                if abs(rotations[name] - expected_bind) > angle_tolerance:
                    issues.add("bind_pose_mismatch", bone=name,
                               profile_bind_deg=bones[name]["bind_local_rotation_deg"],
                               first_frame_deg=math.degrees(rotations[name]))
        root = [frame["root"]["x"], frame["root"]["y"]]
        if not all(finite_number(x) for x in root):
            raise ValueError("Invalid root position")
        fk = check_pose(rotations, root, f"frame:{frame['frame']}")
        reported = frame["bones"]
        if set(reported) != set(bones):
            issues.add("hierarchy_mismatch", frame=frame["frame"], reason="frame bone names differ")
        for name in set(reported) & set(bones):
            actual = reported[name]
            if "parent" in actual and actual["parent"] != bones[name]["parent"]:
                issues.add("hierarchy_mismatch", frame=frame["frame"], bone=name, field="parent")
            if actual["length"] != bones[name]["length"]:
                issues.add("bone_length_violation", frame=frame["frame"], bone=name, source="exported_length")
            scales = actual["scale"]
            scale_error = max(abs(scales[0] - 1), abs(scales[1] - 1))
            metrics["scale_error_max"] = max(metrics["scale_error_max"], scale_error)
            if scale_error > args.length_tolerance:
                issues.add("scale_violation", frame=frame["frame"], bone=name, scales=scales)
            for point in ("origin", "tip"):
                error = point_distance(actual[point], fk[name][point])
                metrics["reported_fk_position_error_max"] = max(metrics["reported_fk_position_error_max"], error)
                if error > args.length_tolerance:
                    issues.add("reported_fk_mismatch", frame=frame["frame"], bone=name, point=point, error=error)
            angle_error = angle_distance(actual["world_rotation_rad"], fk[name]["world_rotation_rad"])
            metrics["reported_fk_angle_error_rad_max"] = max(metrics["reported_fk_angle_error_rad_max"], angle_error)
            if angle_error > angle_tolerance or abs(actual["local_rotation_rad"] - rotations[name]) > angle_tolerance:
                issues.add("reported_fk_angle_mismatch", frame=frame["frame"], bone=name)

        required = [side for side in foot_bones if frame["contacts"][side]["required"]]
        metrics["double_support_frame_count" if len(required) > 1 else "single_support_frame_count"] += 1
        stage = frame.get("stage", "unknown")
        stage_metrics = per_stage.setdefault(stage, {"frames": 0, "required_feet": set(),
            "required_frame_counts": {side: 0 for side in foot_bones}, "drift_max": 0.0})
        stage_metrics["frames"] += 1
        for side in required:
            stage_metrics["required_frame_counts"][side] += 1
        for side, foot in foot_bones.items():
            contact = frame["contacts"][side]
            for marker, offset in marker_offsets.items():
                position = local_point(fk[foot]["origin"], fk[foot]["world_rotation_rad"], offset)
                if marker in contact:
                    error = point_distance(contact[marker], position)
                    metrics["reported_marker_error_max"] = max(metrics["reported_marker_error_max"], error)
                    if error > args.length_tolerance:
                        issues.add("reported_marker_mismatch", frame=frame["frame"], side=side, marker=marker)
                key = (side, marker)
                if not contact["required"]:
                    anchors.pop(key, None)
                    continue
                expected_ankle = profile["stance_ankles"][side]
                anchor = anchors.setdefault(key, [expected_ankle[0] + offset[0], expected_ankle[1] + offset[1]])
                drift = point_distance(position, anchor)
                metrics["planted_foot_drift_sampled_max"] = max(metrics["planted_foot_drift_sampled_max"], drift)
                stage_metrics["required_feet"].add(side)
                stage_metrics["drift_max"] = max(stage_metrics["drift_max"], drift)
                support_key = "double_support_drift_max" if len(required) > 1 else "single_support_drift_max"
                metrics[support_key] = max(metrics[support_key], drift)
                if drift > args.contact_tolerance:
                    issues.add("planted_foot_drift", frame=frame["frame"], side=side, marker=marker, drift=drift)
        pose_data.append({"rotations": rotations, "root": root, "anchors": dict(anchors)})

    for index in range(len(frames) - 1):
        first, second = pose_data[index], pose_data[index + 1]
        deltas = {name: second["rotations"][name] - first["rotations"][name] for name in bones}
        metrics["angle_delta_rad_max"] = max(metrics["angle_delta_rad_max"], max(map(abs, deltas.values())))
        if any(abs(d) >= math.pi for d in deltas.values()):
            issues.add("ambiguous_angle_wrap", interval=index)
        interval_markers = {}
        all_sole_markers = {}
        for side, foot in foot_bones.items():
            for marker, offset in marker_offsets.items():
                all_sole_markers[(side, marker)] = {"foot": foot, "offset": offset,
                    "clearance_min": float("inf")}
            if not (frames[index]["contacts"][side]["required"] and frames[index + 1]["contacts"][side]["required"]):
                continue
            for marker, offset in marker_offsets.items():
                interval_markers[(side, marker)] = {"foot": foot, "offset": offset,
                    "anchor": first["anchors"][(side, marker)], "sample_max": 0.0}
        for sample in range(args.interpolation_subdivisions + 1):
            fraction = sample / args.interpolation_subdivisions
            rotations = {name: first["rotations"][name] + fraction * deltas[name] for name in bones}
            root = [a + fraction * (b - a) for a, b in zip(first["root"], second["root"])]
            fk = check_pose(rotations, root, f"interval:{index}:{sample}")
            if 0 < sample < args.interpolation_subdivisions:
                metrics["interpolated_pose_count"] += 1
            for data in all_sole_markers.values():
                transform = fk[data["foot"]]
                position = local_point(transform["origin"], transform["world_rotation_rad"], data["offset"])
                data["clearance_min"] = min(data["clearance_min"], floor_y - position[1])
            for data in interval_markers.values():
                transform = fk[data["foot"]]
                position = local_point(transform["origin"], transform["world_rotation_rad"], data["offset"])
                data["sample_max"] = max(data["sample_max"], point_distance(position, data["anchor"]))
        for (side, marker), data in interval_markers.items():
            curvature = marker_curvature_bound(bones, first["rotations"], second["rotations"], data["foot"], data["offset"])
            bound = data["sample_max"] + curvature / (8 * args.interpolation_subdivisions ** 2)
            metrics["plant_continuity_segments"] += 1
            metrics["planted_foot_drift_continuous_upper_bound_max"] = max(
                metrics["planted_foot_drift_continuous_upper_bound_max"], bound)
            interval_required_count = sum(
                frames[index]["contacts"][s]["required"] and frames[index + 1]["contacts"][s]["required"]
                for s in foot_bones)
            support_key = ("double_support_continuous_upper_bound_max" if interval_required_count > 1
                           else "single_support_continuous_upper_bound_max")
            metrics[support_key] = max(metrics[support_key], bound)
            if bound > args.contact_tolerance:
                issues.add("continuous_plant_bound_exceeded", interval=index, side=side, marker=marker, upper_bound=bound)
        for (side, marker), data in all_sole_markers.items():
            curvature = marker_curvature_bound(bones, first["rotations"], second["rotations"], data["foot"], data["offset"])
            lower_bound = data["clearance_min"] - curvature / (8 * args.interpolation_subdivisions ** 2)
            metrics["sole_clearance_continuous_lower_bound_min"] = min(
                metrics["sole_clearance_continuous_lower_bound_min"], lower_bound)
            if lower_bound < -args.contact_tolerance:
                issues.add("continuous_sole_clearance_bound_exceeded", interval=index, side=side, marker=marker, lower_bound=lower_bound)

    for stage in per_stage.values():
        stage["required_feet"] = sorted(stage["required_feet"])
    metrics["hierarchy_mismatch_count"] = issues.counts.get("hierarchy_mismatch", 0)
    return {"status": "pass" if not issues.counts else "fail", "metrics": metrics,
            "per_stage": per_stage, "issues": issues.as_dict(),
            "interpolation_contract": "Declared linear unwrapped local rotation and root translation; angular bounds are convex endpoint bounds. Foot continuous upper bound uses a second-derivative interpolation remainder.",
            "scope": "JSON-export kinematics only; native enforcement is a separate root-owned test. No medical safety or all-BJJ-motion claim."}


def self_test():
    bones = {"root": {"parent": None, "length": 10}, "child": {"parent": "root", "length": 5}}
    fk = forward_kinematics(bones, {"root": math.pi / 2, "child": -math.pi / 2}, [2, 3])
    assert point_distance(fk["root"]["tip"], [2, 13]) < 1e-12
    assert point_distance(fk["child"]["tip"], [7, 13]) < 1e-12
    bound = marker_curvature_bound(bones, {"root": 0, "child": 0},
                                   {"root": math.pi, "child": 0}, "child", [5, 0])
    assert abs(bound - 15 * math.pi ** 2) < 1e-10
    try:
        forward_kinematics({"a": {"parent": "a", "length": 1}}, {"a": 0}, [0, 0])
    except ValueError:
        pass
    else:
        raise AssertionError("Cycle was not rejected")
    print(json.dumps({"self_test": "pass", "checks": ["analytic_two_bone_fk", "rotating_marker_curvature_bound", "cycle_rejection"]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--timeline", type=Path)
    parser.add_argument("--model-receipt", type=Path)
    parser.add_argument("--contact-tolerance", type=float, default=0.05,
                        help="Drawing coordinate units; numerical/display tolerance, not medical range")
    parser.add_argument("--length-tolerance", type=float, default=1e-6)
    parser.add_argument("--angle-tolerance-deg", type=float, default=1e-6)
    parser.add_argument("--interpolation-subdivisions", type=int, default=8)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not all((args.profile, args.timeline, args.model_receipt)):
        parser.error("--profile, --timeline and --model-receipt are required")
    if args.interpolation_subdivisions < 1 or min(args.contact_tolerance, args.length_tolerance, args.angle_tolerance_deg) <= 0:
        parser.error("Tolerances and interpolation subdivisions must be positive")
    try:
        paths = {"profile": args.profile, "timeline": args.timeline, "model_receipt": args.model_receipt}
        snapshots = {key: path.read_bytes() for key, path in paths.items()}
        data = {key: json.loads(content) for key, content in snapshots.items()}
        result = verify(data["profile"], data["timeline"], data["model_receipt"], args)
        result["inputs"] = {key: {"path": str(path.resolve()), "bytes": len(snapshots[key]),
                                  "sha256": hashlib.sha256(snapshots[key]).hexdigest()} for key, path in paths.items()}
        result["tolerances"] = {"contact_drawing_units": args.contact_tolerance,
            "length_drawing_units": args.length_tolerance, "angle_deg": args.angle_tolerance_deg,
            "interpolation_subdivisions": args.interpolation_subdivisions}
        result["verifier"] = {"path": str(Path(__file__).resolve()),
            "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    except (ValueError, KeyError, TypeError, OSError) as error:
        result = {"status": "incomplete", "error_type": type(error).__name__, "error": str(error)}
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Redraw the route diagram in a wayfinder map from its ticket files.

Usage: python3 scripts/render-route.py [.scratch/<effort>]

Reads each ticket's title and its Type, Status, and Blocked by lines, then
replaces the block between <!-- route:start --> and <!-- route:end --> in
map.md. A ticket is on the frontier when it is open and every ticket
blocking it is resolved. Tickets closed as out of scope are left off the
route. Any malformed ticket stops the script before map.md is touched.
"""

import re
import sys
from pathlib import Path

START, END = "<!-- route:start -->", "<!-- route:end -->"
TYPES = {"research", "prototype", "grilling", "task"}
STATUSES = {"open", "claimed", "resolved", "out-of-scope"}

STYLES = {
    "resolved": "fill:#e4e4e7,stroke:#a1a1aa,color:#52525b",
    "claimed": "fill:#dbeafe,stroke:#2563eb,color:#1e3a8a",
    "frontier": "fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px",
    "blocked": "fill:#ffffff,stroke:#a1a1aa,color:#18181b",
}


def field(text, name):
    match = re.search(rf"^{name}:[ \t]*(\S[^\n]*)$", text, re.M)
    return match.group(1).strip() if match else None


def read_ticket(path, errors):
    text = path.read_text()
    title = text.splitlines()[0] if text.strip() else ""
    if not title.startswith("# "):
        errors.append(f"{path}: first line must be the '# Title'")
        return None
    ticket = {
        "id": path.name[:2],
        "name": title[2:].split(":")[0].strip(),
        "type": field(text, "Type"),
        "status": field(text, "Status"),
        "blocked_by": [],
    }
    if ticket["type"] not in TYPES:
        errors.append(f"{path}: Type must be one of {sorted(TYPES)}, got {ticket['type']!r}")
    if ticket["status"] not in STATUSES:
        errors.append(f"{path}: Status must be one of {sorted(STATUSES)}, got {ticket['status']!r}")
    blocked = field(text, "Blocked by")
    if blocked is None:
        errors.append(f"{path}: 'Blocked by:' line is missing or empty (use 'none')")
    elif blocked != "none":
        if not re.fullmatch(r"\d{2}(\s*,\s*\d{2})*", blocked):
            errors.append(f"{path}: 'Blocked by:' must be 'none' or two-digit ids like '06, 07', got {blocked!r}")
        else:
            ticket["blocked_by"] = re.findall(r"\d{2}", blocked)
    return ticket


def check_links(tickets, errors):
    by_id = {}
    for t in tickets:
        if t["id"] in by_id:
            errors.append(f"ticket id {t['id']} is used by more than one file")
        by_id[t["id"]] = t
    for t in tickets:
        for b in t["blocked_by"]:
            if b == t["id"]:
                errors.append(f"ticket {t['id']}: blocked by itself")
            elif b not in by_id:
                errors.append(f"ticket {t['id']}: blocked by {b}, which does not exist")
            elif by_id[b]["status"] == "out-of-scope" and t["status"] != "out-of-scope":
                errors.append(f"ticket {t['id']}: blocked by {b}, which is out of scope; rewire it")
    for cycle in find_cycles(by_id):
        errors.append("blocking cycle: " + " -> ".join(cycle))


def find_cycles(by_id):
    """Return each blocking cycle once, as a list of ticket ids."""
    cycles, done = [], set()

    def visit(tid, path):
        if tid in path:
            cycles.append(path[path.index(tid):] + [tid])
            return
        if tid in done or tid not in by_id:
            return
        for b in by_id[tid]["blocked_by"]:
            if b != tid:
                visit(b, path + [tid])
        done.add(tid)

    for tid in sorted(by_id):
        visit(tid, [])
    return cycles


def state(ticket, by_id):
    if ticket["status"] in ("resolved", "claimed"):
        return ticket["status"]
    if all(by_id[b]["status"] == "resolved" for b in ticket["blocked_by"]):
        return "frontier"
    return "blocked"


def render(tickets):
    live = [t for t in tickets if t["status"] != "out-of-scope"]
    by_id = {t["id"]: t for t in live}
    lines = ["```mermaid", "flowchart LR"]
    for t in live:
        name = t["name"].replace('"', "#quot;")
        lines.append(f'    T{t["id"]}["{t["id"]} {name}<br/><small>{t["type"]}</small>"]')
    for t in live:
        for b in t["blocked_by"]:
            lines.append(f"    T{b} --> T{t['id']}")
    for name, style in STYLES.items():
        lines.append(f"    classDef {name} {style}")
    for name in STYLES:
        ids = [f"T{t['id']}" for t in live if state(t, by_id) == name]
        if ids:
            lines.append(f"    class {','.join(ids)} {name}")
    lines.append("```")
    return "\n".join(lines)


def main():
    effort = Path(sys.argv[1] if len(sys.argv) > 1 else ".scratch/jev-ios-bridge")
    map_path, issues = effort / "map.md", effort / "issues"
    if not map_path.is_file() or not issues.is_dir():
        sys.exit(f"{effort}: expected map.md and issues/ here; run from the repo root or pass the effort directory")

    errors = []
    tickets = [t for p in sorted(issues.glob("[0-9][0-9]-*.md")) if (t := read_ticket(p, errors))]
    check_links(tickets, errors)
    body = map_path.read_text()
    if START not in body or END not in body:
        errors.append(f"{map_path}: missing {START} / {END} markers")
    if errors:
        sys.exit("route not redrawn:\n  " + "\n  ".join(errors))

    head, rest = body.split(START, 1)
    _, tail = rest.split(END, 1)
    map_path.write_text(f"{head}{START}\n{render(tickets)}\n{END}{tail}")
    print(f"{map_path}: route redrawn from {len(tickets)} tickets")


if __name__ == "__main__":
    main()

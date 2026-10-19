"""Bounded host parsing only. No device or file entity access."""
import json
import sys
import xml.etree.ElementTree as ET

try:
    request = json.load(sys.stdin)
    xml = request['xml']
    platform = request['platform']
    assert len(xml.encode('utf-8')) <= 1024 * 1024
    assert '<!DOCTYPE' not in xml.upper() and '<!ENTITY' not in xml.upper()
    root = ET.fromstring(xml)
    assert root.tag == ('AppiumAUT' if platform == 'ios' else 'hierarchy')
    nodes = list(root.iter())
    assert len(nodes) <= 10000
    pending = [(root, 1)]
    while pending:
        node, depth = pending.pop()
        assert depth <= 128
        pending.extend((child, depth + 1) for child in node)
    key, value = ('name', 'value') if platform == 'ios' else ('resource-id', 'text')
    summaries = [node for node in nodes if node.get(key) == 'selection.summary']
    assert len(summaries) == 1 and value in summaries[0].attrib
    print(json.dumps({'summary': summaries[0].get(value), 'nodeCount': len(nodes)}))
except Exception:
    print('INVALID_XML_RESULT', file=sys.stderr)
    sys.exit(1)

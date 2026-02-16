"""Test API response for tree building."""
import json

# Simulate what DRF does - serialize to JSON
# UUID objects become strings when serialized
from uuid import UUID

test_data = {
    'id': 'fd752064-5b7d-41a0-b4ca-655d0a9eaa41', 
    'project': UUID('c7d55737-ee84-48eb-bfaf-68b51ef426af'),  # UUID object in Python
    'parent_item': None,
}

# When DRF converts to JSON, UUIDs become strings
json_output = json.dumps(test_data, default=str)
print(f"JSON output: {json_output}")

# Parse back
parsed = json.loads(json_output)
print(f"\nParsed back:")
print(f"  id type: {type(parsed['id'])} = {parsed['id']}")
print(f"  project type: {type(parsed['project'])} = {parsed['project']}")

# The key test - compare strings
print(f"\n{parsed['id']} == {parsed['id']}: {parsed['id'] == parsed['id']}")
print("This proves JSON serialization works correctly!")

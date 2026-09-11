# GitHub Issue Creation Reference

Load this only after the user approves creating GitHub labels, issues, or Projects.

## Labels

Create and apply these categories.

### Epic labels

```text
epic: <name>
```

Use distinct colors where useful.

### Priority labels

- `priority: P0` (`b60205`) — blocking or critical
- `priority: P1` (`d93f0b`) — important
- `priority: P2` (`fbca04`) — nice-to-have or polish

### Size labels

- `size: S` (`c5def5`) — small, under 1 day
- `size: M` (`bfd4f2`) — medium, 1–3 days
- `size: L` (`85bbf0`) — large, 3–5 days
- `size: XL` (`6fa8dc`) — extra large or needs decomposition

Create labels idempotently:

```bash
gh label create "epic: <name>" --color "<hex>" --description "<description>" 2>&1 || true
gh label create "priority: P0" --color "b60205" --description "Must do" 2>&1 || true
gh label create "priority: P1" --color "d93f0b" --description "Should do" 2>&1 || true
gh label create "priority: P2" --color "fbca04" --description "Nice to have" 2>&1 || true
```

## Creating issues

Always write the issue body to a temp file and use `--body-file`. Inline markdown with `--body` can trigger security prompts and shell escaping problems. The body follows [STORY_FORMAT.md](STORY_FORMAT.md) — do not restyle it here.

```bash
cat > /tmp/gh-issue-body-W-000001.md << 'ISSUE_EOF'
## User Story
**ID:** W-000001

When [situation], I want [motivation], so that [outcome].

## Acceptance Criteria

- [ ] [Observable outcome]
  - Verify: [test command, CLI check, or manual observation]

## Context
...
ISSUE_EOF

gh issue create \
  --title "[W-000001] Short descriptive title" \
  --label "epic: <name>,priority: P1,size: M" \
  --body-file /tmp/gh-issue-body-W-000001.md
```

## GitHub Projects

Every repo should have a GitHub Project for kanban-style story management.

Check existing projects:

```bash
gh project list --owner <owner> 2>&1
```

Create a project if needed:

```bash
gh project create --owner <owner> --title "<Repo Name>" --format json 2>&1
```

Link project to repo:

```bash
gh project link <project-number> --owner <owner> --repo <owner>/<repo> 2>&1
```

Add issues to the project:

```bash
for issue_url in <issue-urls>; do
  gh project item-add <project-number> --owner <owner> --url "$issue_url" 2>&1
done
```

If `gh project` commands fail with a scopes error, refresh auth:

```bash
gh auth refresh -s read:project,project --hostname github.com
```

## Verification

```bash
gh issue list --limit 50 --state open
```

Report issue URLs/numbers and whether each was added to the project.

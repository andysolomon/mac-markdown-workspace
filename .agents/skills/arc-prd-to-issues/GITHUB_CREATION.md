# GitHub Creation Reference

Load this only after the user approves the slice breakdown.

## Fetch PRD issue

```bash
gh issue view <number> --comments --json title,body,comments,labels
```

## Create slice issues

Create issues in dependency order.

Use temp files and `--body-file` for markdown bodies.

```bash
cat > /tmp/prd-slice-1.md << 'ISSUE_EOF'
## Parent PRD

#<prd-issue-number>

## What to build
...
ISSUE_EOF

gh issue create \
  --title "[Slice 1] Short title" \
  --label "from-prd" \
  --body-file /tmp/prd-slice-1.md
```

## Parent PRD

Do not close or modify the parent PRD issue unless the user explicitly asks.

## PR convention

When implementing later, PR bodies should include:

```text
Closes #<slice-issue-number>
```

For PRs that implement multiple slices, include multiple `Closes` lines.

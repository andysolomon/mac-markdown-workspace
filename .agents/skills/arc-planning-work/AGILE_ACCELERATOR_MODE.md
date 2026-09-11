# Agile Accelerator Planning Mode

Load this when the source work item is a Salesforce Agile Accelerator story such as `W-000123`.

## Read source

Determine target org alias if unknown:

```bash
sf org list --json
```

Query the work item:

```bash
sf data query --query "SELECT Id, Name, agf__Subject__c, agf__Status__c, agf__Story_Points__c, agf__Details__c, agf__Type__c, agf__Priority__c, agf__Epic__c, agf__Epic__r.Name, agf__Sprint__c, agf__Sprint__r.Name FROM agf__ADM_Work__c WHERE Name = '<W-XXXXXX>'" --target-org <org-alias> --json
```

Read sprint plan docs if present:

```bash
ls docs/sprints/SPRINT_*_PLAN.md
```

## Publish plan

Preserve existing story details. Append the implementation plan below a separator.

```text
<existing details>

---

## Implementation Plan
...
```

Update the record and move status to In Progress where appropriate:

```bash
sf data update record \
  --sobject agf__ADM_Work__c \
  --record-id <id> \
  --values "agf__Details__c='<existing details + plan>' agf__Status__c='In Progress'" \
  --target-org <org-alias>
```

`agf__Details__c` is rich text; preserve existing content and use newline escapes if passing through a shell.

## Branch naming

```bash
git checkout -b feat/W-XXXXXX-short-description
```

## Sprint plan docs

If a matching `docs/sprints/` plan exists, add or update the implementation plan in the corresponding story section.

## Docs artifacts

After updating the Agile Accelerator record, also create synchronized in-flight artifacts under `docs/`:

- `docs/<W-XXXXXX>-IMPLEMENTATION_PLAN.md`
- `docs/<W-XXXXXX>-progress.txt`

Follow `arc-implementation-plan-progress/references/output-contract.md`. Initialize progress with:

```bash
mkdir -p docs
arc-implementation-plan-progress/scripts/init_progress_txt.sh \
  docs/<W-XXXXXX>-IMPLEMENTATION_PLAN.md \
  docs/<W-XXXXXX>-progress.txt
```

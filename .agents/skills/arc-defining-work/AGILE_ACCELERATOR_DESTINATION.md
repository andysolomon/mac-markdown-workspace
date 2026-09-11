# Agile Accelerator Destination

Load this only after the user chooses Agile Accelerator. Story bodies placed in `agf__Details__c` follow `arc-creating-user-stories/STORY_FORMAT.md`.

## Prerequisites

Find target org if unknown:

```bash
sf org list --json
```

Discover sprint and epic records:

```bash
sf data query --query "SELECT Id, Name, agf__Name__c FROM agf__ADM_Sprint__c ORDER BY CreatedDate DESC LIMIT 10" --target-org <org-alias> --json
sf data query --query "SELECT Id, Name, agf__Name__c FROM agf__ADM_Epic__c ORDER BY CreatedDate DESC LIMIT 20" --target-org <org-alias> --json
```

## Create work records

Do not set `Name`; Salesforce auto-generates the `W-` number.

```bash
sf data create record \
  --sobject agf__ADM_Work__c \
  --values "agf__Subject__c='<title>' agf__Details__c='<story body>' agf__Priority__c='P1' agf__Story_Points__c='3' agf__Type__c='User Story'" \
  --target-org <org-alias> \
  --json
```

After creation, query the record to retrieve `Name`.

```bash
sf data query --query "SELECT Id, Name, agf__Subject__c FROM agf__ADM_Work__c WHERE Id = '<id>'" --target-org <org-alias> --json
```

## Verify

Query all created records and report IDs + assigned `W-` numbers.

## Notes

- Preserve rich text formatting in `agf__Details__c`.
- If sprint/epic association is unknown, ask before creating or create without association only with user approval.

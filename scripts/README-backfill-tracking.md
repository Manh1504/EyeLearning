# Tracking PDF Context Backfill

Run this only after the new tracking schema and ingestion fixes are deployed.

1. Back up the database:

```bash
docker exec eyelearn_postgres pg_dump -U eyelearn_user eyelearn > eyelearn_before_tracking_backfill.sql
```

2. Apply the backfill:

```bash
docker exec -i eyelearn_postgres psql -U eyelearn_user -d eyelearn < scripts/backfill_tracking_pdf_context.sql
```

The script prints mapping counts before and after. It does not modify `confidence`; legacy rows without real model confidence remain `NULL`.

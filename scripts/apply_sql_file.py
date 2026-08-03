import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

from web.database import engine


async def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: apply_sql_file.py path/to/file.sql")
    sql = Path(sys.argv[1]).read_text(encoding="utf-8")
    statements = [statement.strip() for statement in sql.split(";") if statement.strip()]
    async with engine.begin() as conn:
        for statement in statements:
            await conn.execute(text(statement))


if __name__ == "__main__":
    asyncio.run(main())

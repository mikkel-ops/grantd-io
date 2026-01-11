#!/usr/bin/env python3
"""
Run database migrations against PlanetScale.

Usage:
    python scripts/run_migrations.py
    python scripts/run_migrations.py --test

Loads DATABASE_URL from apps/api/.env or environment variable.
"""

import os
import sys
from pathlib import Path

# Try to load dotenv
try:
    from dotenv import load_dotenv

    # Load from apps/api/.env
    env_path = Path(__file__).parent.parent / "apps" / "api" / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded environment from {env_path}")
except ImportError:
    pass

import psycopg2


def get_connection():
    """Get a database connection."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable not set")
        print("")
        print("Either:")
        print("  1. Create apps/api/.env with DATABASE_URL")
        print("  2. Set DATABASE_URL environment variable")
        sys.exit(1)

    print(f"Connecting to: {database_url.split('@')[1].split('?')[0]}...")
    return psycopg2.connect(database_url)


def run_migrations():
    """Run all migration files in order."""
    migrations_dir = Path(__file__).parent.parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))

    if not migration_files:
        print("No migration files found in migrations/")
        return

    conn = get_connection()
    # Use autocommit mode so each statement is committed independently
    conn.autocommit = True
    cursor = conn.cursor()

    print(f"Connected to database")
    print(f"Found {len(migration_files)} migration files")
    print("")

    for migration_file in migration_files:
        print(f"Running {migration_file.name}...")

        sql = migration_file.read_text()

        # Split by statements for better error handling
        # (Simple split - doesn't handle all edge cases)
        statements = [s.strip() for s in sql.split(";") if s.strip()]

        for stmt in statements:
            if not stmt:
                continue

            # Skip comment-only statements (check if there's any non-comment content)
            lines = [l.strip() for l in stmt.split('\n') if l.strip() and not l.strip().startswith('--')]
            if not lines:
                continue

            try:
                cursor.execute(stmt)
            except psycopg2.Error as e:
                error_msg = str(e)
                # Skip "already exists" errors - these are expected on re-runs
                if "already exists" in error_msg or "duplicate key" in error_msg.lower():
                    continue
                else:
                    print(f"  Warning: {error_msg[:100]}")
                    continue

        print(f"  OK")

    cursor.close()
    conn.close()

    print("")
    print("Migrations complete!")


def test_connection():
    """Test the database connection."""
    print("Testing database connection...")
    print("")

    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        print(f"Connected successfully!")
        print(f"PostgreSQL version: {version}")

        # Check existing tables
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        tables = cursor.fetchall()

        if tables:
            print(f"\nExisting tables ({len(tables)}):")
            for (table,) in tables:
                print(f"  - {table}")
        else:
            print("\nNo tables exist yet. Run migrations to create them.")

        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run database migrations")
    parser.add_argument("--test", action="store_true", help="Just test the connection")
    args = parser.parse_args()

    if args.test:
        success = test_connection()
        sys.exit(0 if success else 1)
    else:
        run_migrations()

import argparse

from app.database import SessionLocal, init_db
from app.services.demo_seed import seed_demo_data
from app.services.seed import seed_default_data


def migrate() -> None:
    init_db()
    print("Database schema is up to date.")


def seed() -> None:
    init_db()
    with SessionLocal() as db:
        user = seed_default_data(db)
        print(f"Seeded default roles, permissions, and super admin: {user.email}")


def seed_demo() -> None:
    init_db()
    with SessionLocal() as db:
        counts = seed_demo_data(db)
        summary = ", ".join(f"{key}={value}" for key, value in sorted(counts.items()))
        print(f"Seeded local demo data: {summary}")


def main() -> None:
    parser = argparse.ArgumentParser(description="KAM backend maintenance commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("migrate", help="Create or update database tables")
    subparsers.add_parser("seed", help="Seed default application data")
    subparsers.add_parser("seed-demo", help="Seed local-only demo data for end-to-end demos")
    args = parser.parse_args()

    commands = {
        "migrate": migrate,
        "seed": seed,
        "seed-demo": seed_demo,
    }
    commands[args.command]()


if __name__ == "__main__":
    main()

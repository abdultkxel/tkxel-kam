import argparse

from app.database import SessionLocal, init_db
from app.services.seed import seed_super_admin


def migrate() -> None:
    init_db()
    print("Database schema is up to date.")


def seed() -> None:
    init_db()
    with SessionLocal() as db:
        user = seed_super_admin(db)
        print(f"Seeded super admin: {user.email}")


def main() -> None:
    parser = argparse.ArgumentParser(description="KAM backend maintenance commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("migrate", help="Create or update database tables")
    subparsers.add_parser("seed", help="Seed default application data")
    args = parser.parse_args()

    commands = {
        "migrate": migrate,
        "seed": seed,
    }
    commands[args.command]()


if __name__ == "__main__":
    main()

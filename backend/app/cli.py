import argparse

from app.database import SessionLocal, init_db
from app.services.seed import clear_forecast_demo_data, seed_base_data, seed_forecast_demo_data


def migrate() -> None:
    init_db()
    print("Database schema is up to date.")


def seed() -> None:
    init_db()
    with SessionLocal() as db:
        user = seed_base_data(db)
        print(f"Seeded base roles, permissions, allowed domains, and users. Super admin: {user.email}")


def seed_forecast_demo() -> None:
    init_db()
    with SessionLocal() as db:
        result = seed_forecast_demo_data(db)
        print(
            "Seeded forecast demo data. "
            f"Account: {result['account_name']} ({result['account_id']}), "
            f"owner: {result['owner_email']}, opportunities: {result['opportunities']}."
        )


def clear_forecast_demo() -> None:
    init_db()
    with SessionLocal() as db:
        removed = clear_forecast_demo_data(db)
        if removed:
            print("Removed forecast demo data.")
            return
        print("No forecast demo data was present.")


def main() -> None:
    parser = argparse.ArgumentParser(description="KAM backend maintenance commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("migrate", help="Create or update database tables")
    subparsers.add_parser("seed", help="Seed default application data")
    subparsers.add_parser("seed-forecast-demo", help="Seed opt-in demo records for the six-month forecast graph")
    subparsers.add_parser("clear-forecast-demo", help="Remove opt-in forecast demo records")
    args = parser.parse_args()

    commands = {
        "migrate": migrate,
        "seed": seed,
        "seed-forecast-demo": seed_forecast_demo,
        "clear-forecast-demo": clear_forecast_demo,
    }
    commands[args.command]()


if __name__ == "__main__":
    main()

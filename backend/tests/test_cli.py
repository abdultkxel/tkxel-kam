from sqlalchemy import create_engine, inspect, text

from app import cli


def test_drop_all_tables_removes_legacy_sqlite_tables(tmp_path, monkeypatch) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'reset.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE legacy_seed_table (id INTEGER PRIMARY KEY, name TEXT)"))
        connection.execute(text("INSERT INTO legacy_seed_table (name) VALUES ('old demo data')"))

    monkeypatch.setattr(cli, "engine", engine)

    cli._drop_all_tables()

    assert "legacy_seed_table" not in inspect(engine).get_table_names()

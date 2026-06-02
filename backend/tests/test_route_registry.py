from app.main import app


def test_api_route_method_path_pairs_are_unique() -> None:
    seen: dict[tuple[str, tuple[str, ...]], str] = {}

    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api"):
            continue
        methods = tuple(sorted(method for method in getattr(route, "methods", set()) if method not in {"HEAD", "OPTIONS"}))
        key = (path, methods)
        route_name = getattr(route, "name", path)

        assert key not in seen, f"Duplicate API route {methods} {path}: {seen[key]} and {route_name}"
        seen[key] = route_name

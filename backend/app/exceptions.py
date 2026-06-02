from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def readable_field(loc: tuple[str | int, ...]) -> str:
    field_path = [str(item) for item in loc if item not in {"body", "query", "path"}]
    return ".".join(field_path) or "request"


def readable_message(message: str) -> str:
    cleaned_message = message.removeprefix("Value error, ").strip()
    return cleaned_message[:1].upper() + cleaned_message[1:] if cleaned_message else "Invalid value."


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {
            "field": readable_field(tuple(error.get("loc", ()))),
            "message": readable_message(str(error.get("msg", "Invalid value."))),
        }
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"message": "Validation failed", "errors": errors})

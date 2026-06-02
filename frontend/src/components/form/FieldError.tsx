export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null

  return (
    <p id={id} className="mt-1.5 text-xs font-semibold text-rag-red">
      {message}
    </p>
  )
}

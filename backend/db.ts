export function throwDb(error: { message: string } | null | undefined): void {
  if (error) throw error;
}

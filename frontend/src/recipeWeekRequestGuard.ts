export type RecipeWeekRequest = {
  refrigeratorId: string
  monday: string
  sequence: number
}

/** Tracks the latest recipe request so stale week or refrigerator responses cannot update shared state. */
export class RecipeWeekRequestGuard {
  private sequence = 0

  begin(refrigeratorId: string, monday: string): RecipeWeekRequest {
    this.sequence += 1
    return { refrigeratorId, monday, sequence: this.sequence }
  }

  isCurrent(request: RecipeWeekRequest, refrigeratorId: string, monday: string): boolean {
    return request.sequence === this.sequence
      && request.refrigeratorId === refrigeratorId
      && request.monday === monday
  }
}

/** Error for errors that come from the user input.
 * - This is for errors that should be returned back to user.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

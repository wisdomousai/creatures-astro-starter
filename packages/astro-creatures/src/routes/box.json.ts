import { boxContent } from '../box-content';

// The room's words (src/box-content.ts), fetched when a visitor plays.
export async function GET() {
  return Response.json(await boxContent());
}

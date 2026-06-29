import { GET as getCitation, revalidate } from "../../../cite/[slug]/route";

export { revalidate };
export const GET = getCitation;

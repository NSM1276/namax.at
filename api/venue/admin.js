// www.namax.at/liste?k=… (rewritten here by vercel.json) → Nasim's private list of venue pages.
import { handleAdmin, handleAdminPost } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const GET = (request) => handleAdmin(request, services());
// JSON {k, slug} → new owner link; multipart {k, slug, photo|delete} → facade photo
export const POST = (request) => handleAdminPost(request, services());

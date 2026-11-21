// www.namax.at/liste?k=… (rewritten here by vercel.json) → Nasim's private list of venue pages.
import { handleAdmin, handleAdminRotate } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const GET = (request) => handleAdmin(request, services());
export const POST = (request) => handleAdminRotate(request, services());

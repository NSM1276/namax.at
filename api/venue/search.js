// namax.at/kostenlos: GET /api/venue/search?q=… → public venues whose name matches (at most 8).
import { handleSearch } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const GET = (request) => handleSearch(request, services());

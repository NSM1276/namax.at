// Sitemap of public venue pages: https://www.namax.at/api/venue/sitemap (named in each venue's robots.txt).
import { handleSitemap } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const GET = (request) => handleSitemap(request, services());

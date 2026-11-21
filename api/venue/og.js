// <slug>.namax.at/api/venue/og?v=… → the link preview picture (og:image) of that venue.
import { handleOg } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const GET = (request) => handleOg(request, services());

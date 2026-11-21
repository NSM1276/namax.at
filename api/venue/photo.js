// Owner photo upload: multipart k + photo on <slug>.namax.at/api/venue/photo.
import { handlePhoto } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const POST = (request) => handlePhoto(request, services());

// src/utils/geocode.js
import axios from "axios";

export async function geocodeAddress({ address, city }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  // Build a single-line address (street + city)
  const q = [address, city].filter(Boolean).join(", ");

  const url = "https://maps.googleapis.com/maps/api/geocode/json";
  const { data } = await axios.get(url, {
    params: { address: q, key },
    // Optional: set a timeout so requests don't hang forever
    timeout: 8000,
  });

  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`Geocoding failed (${data.status}) for: ${q}`);
  }

  const first = data.results[0];
  const { lat, lng } = first.geometry.location;

  // Try to extract city/country from address_components (best-effort)
  const comp = (type) =>
    first.address_components.find((c) => c.types.includes(type))?.long_name;

  return {
    lat,
    lng,
    placeId: first.place_id,
    formattedAddress: first.formatted_address,
    city:
      comp("locality") || comp("administrative_area_level_2") || city || null,
    country: comp("country") || null,
    raw: first, // keep if you want to debug; remove if you prefer minimal storage
  };
}

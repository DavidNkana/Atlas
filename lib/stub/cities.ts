/**
 * Day 6 — location-aware curated stub.
 *
 * Hand-curated table of 23 African cities that Atlas users have actually
 * asked about (or that are high-density markets near where our users
 * operate). The stub generator (lib/stub/sites.ts) consumes this table
 * to return plausible site candidates for the detected city, instead of
 * always returning Lusaka.
 *
 * Each entry includes:
 *  - id: stable kebab-case slug (used as a seed and for telemetry)
 *  - name: pretty city name (used in the UI banner + site names)
 *  - aliases: lowercased substring phrases that map to this city. Order
 *    doesn't matter — detect.ts sorts by length so the longest
 *    most-specific alias wins.
 *  - country / countryCode / currency: shown in the stub response
 *  - lat / lng: city-centre coordinates used as the seed point for
 *    generateStubSites()
 *
 * The default city is Johannesburg — Atlas is targeting South Africa
 * primarily (Sandton, Jozi, Pretoria are the most-asked cities) and
 * Johannesburg sits in the middle of that cluster.
 */

export type City = {
  id: string;
  name: string;
  aliases: string[];
  country: string;
  lat: number;
  lng: number;
  countryCode: string;
  currency: string;
};

export const CITIES: City[] = [
  // South Africa — most-asked cluster
  { id: "sandton",       name: "Sandton",        aliases: ["sandton", "sand city", "sandton city"],                                       country: "South Africa", lat: -26.1075, lng: 28.0567, countryCode: "ZA", currency: "ZAR" },
  { id: "johannesburg",  name: "Johannesburg",   aliases: ["johannesburg", "joburg", "jozi", "jhb"],                                       country: "South Africa", lat: -26.2041, lng: 28.0473, countryCode: "ZA", currency: "ZAR" },
  { id: "pretoria",      name: "Pretoria",       aliases: ["pretoria", "tshwane"],                                                         country: "South Africa", lat: -25.7479, lng: 28.2293, countryCode: "ZA", currency: "ZAR" },
  { id: "cape_town",     name: "Cape Town",      aliases: ["cape town", "capetown", "kaapstad"],                                        country: "South Africa", lat: -33.9249, lng: 18.4241, countryCode: "ZA", currency: "ZAR" },
  { id: "durban",        name: "Durban",         aliases: ["durban", "ethekwini"],                                                        country: "South Africa", lat: -29.8587, lng: 31.0218, countryCode: "ZA", currency: "ZAR" },
  { id: "port_elizabeth",name: "Port Elizabeth", aliases: ["port elizabeth", "gqeberha"],                                                  country: "South Africa", lat: -33.9580, lng: 25.6000, countryCode: "ZA", currency: "ZAR" },
  { id: "bloemfontein",  name: "Bloemfontein",   aliases: ["bloemfontein", "mangaung"],                                                    country: "South Africa", lat: -29.0852, lng: 26.1596, countryCode: "ZA", currency: "ZAR" },

  // Zambia — home market
  { id: "lusaka",        name: "Lusaka",         aliases: ["lusaka"],                                                                     country: "Zambia",       lat: -15.3875, lng: 28.3228, countryCode: "ZM", currency: "ZMW" },
  { id: "kitwe",         name: "Kitwe",          aliases: ["kitwe"],                                                                      country: "Zambia",       lat: -12.8024, lng: 28.2132, countryCode: "ZM", currency: "ZMW" },
  { id: "livingstone",   name: "Livingstone",    aliases: ["livingstone", "maramba"],                                                      country: "Zambia",       lat: -17.8531, lng: 25.8575, countryCode: "ZM", currency: "ZMW" },
  { id: "ndola",         name: "Ndola",          aliases: ["ndola"],                                                                      country: "Zambia",       lat: -12.9592, lng: 28.6225, countryCode: "ZM", currency: "ZMW" },

  // East Africa
  { id: "nairobi",       name: "Nairobi",        aliases: ["nairobi"],                                                                    country: "Kenya",        lat:  -1.2921, lng: 36.8219, countryCode: "KE", currency: "KES" },
  { id: "mombasa",       name: "Mombasa",        aliases: ["mombasa"],                                                                    country: "Kenya",        lat:  -4.0435, lng: 39.6682, countryCode: "KE", currency: "KES" },
  { id: "kampala",       name: "Kampala",        aliases: ["kampala"],                                                                    country: "Uganda",       lat:   0.3476, lng: 32.5825, countryCode: "UG", currency: "UGX" },
  { id: "kigali",        name: "Kigali",         aliases: ["kigali"],                                                                     country: "Rwanda",       lat:  -1.9706, lng: 30.1044, countryCode: "RW", currency: "RWF" },
  { id: "addis_ababa",   name: "Addis Ababa",    aliases: ["addis ababa", "addis abeba"],                                                  country: "Ethiopia",     lat:   9.1450, lng: 38.7451, countryCode: "ET", currency: "ETB" },

  // Southern Africa (non-ZA)
  { id: "harare",        name: "Harare",         aliases: ["harare", "salisbury"],                                                         country: "Zimbabwe",     lat: -17.8252, lng: 31.0335, countryCode: "ZW", currency: "USD" },
  { id: "windhoek",      name: "Windhoek",       aliases: ["windhoek"],                                                                   country: "Namibia",      lat: -22.5609, lng: 17.0658, countryCode: "NA", currency: "NAD" },
  { id: "gaborone",      name: "Gaborone",       aliases: ["gaborone", "gabs"],                                                            country: "Botswana",     lat: -24.6282, lng: 25.9231, countryCode: "BW", currency: "BWP" },

  // West Africa
  { id: "lagos",         name: "Lagos",          aliases: ["lagos", "eko"],                                                                country: "Nigeria",      lat:   6.5244, lng:  3.3792, countryCode: "NG", currency: "NGN" },
  { id: "abuja",         name: "Abuja",          aliases: ["abuja"],                                                                      country: "Nigeria",      lat:   9.0765, lng:  7.3986, countryCode: "NG", currency: "NGN" },
  { id: "accra",         name: "Accra",          aliases: ["accra"],                                                                      country: "Ghana",        lat:   5.6037, lng: -0.1870, countryCode: "GH", currency: "GHS" },

  // North Africa
  { id: "cairo",         name: "Cairo",          aliases: ["cairo", "al-qahira"],                                                          country: "Egypt",        lat:  30.0444, lng: 31.2357, countryCode: "EG", currency: "EGP" },
];

/**
 * Default city when no alias in the user's question matches anything in
 * the CITIES table. Johannesburg is the most-asked-about city in our
 * current traffic and is geographically central to the most-asked cluster
 * (Sandton / Pretoria / Joburg), so it makes a reasonable fallback.
 */
export const DEFAULT_CITY: City =
  CITIES.find((c) => c.id === "johannesburg") ?? CITIES[0];

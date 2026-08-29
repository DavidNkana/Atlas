/**
 * Task 3 — SA metro zoning (simplified).
 *
 * Answers the LEGAL half of "can I build here?". A developer's first
 * question about any plot is not what it costs, it is what the scheme
 * lets them put on it — and until now the Decision Block's Zoning
 * section had nothing but a "go ask the City" callout.
 *
 * PROVENANCE + LIMITS — read this before trusting a zone.
 *
 * Zone names and categories follow the real schemes:
 *   - City of Cape Town Municipal Planning By-Law / Development
 *     Management Scheme (SR, GR, LB, GB, MU, GI, TR, OS, AG, RU)
 *   - City of Johannesburg Land Use Scheme 2018 (Residential 1-4,
 *     Business 1-4, Industrial 1-3, Agricultural, Transport, Special)
 *   - eThekwini Town Planning Scheme (Residential 1-9, General /
 *     Local Commercial, Mixed Use, Light / General Industrial,
 *     Special Zone, Agriculture)
 *
 * The GEOMETRY is deliberately coarse. Each entry is an axis-aligned
 * rectangle over a suburb's predominant zoning, NOT the cadastral
 * zoning of an individual erf. Real schemes are erf-by-erf: one street
 * in Sea Point can carry four different rights, and a single plot can
 * be split-zoned. So this layer answers "what is this AREA broadly
 * zoned for" — a screening question — and it must never be presented
 * as the zoning certificate for a specific property.
 *
 * That is why the connector's output keeps the "confirm scheme rights
 * with the municipal Land Use Management department" callout next to
 * the zone it found: the zone narrows the search, the City confirms it.
 *
 * REPLACE-ME: CoCT, CoJ and eThekwini all publish zoning as WFS/ArcGIS
 * feature services. When one is wired, swap the table behind
 * `findZoning` — the signature stays the same.
 */

export type ZoningZone = {
  /** Human-readable zone name, e.g. "Mixed Use 2 (MU2)", "General Residential 1 (GR1)", "Service Station (SS)" */
  name: string;
  /** Zone category: "residential" | "commercial" | "industrial" | "mixed_use" | "agricultural" | "special" | "transport" */
  category: string;
  /** Polygon as [lat, lng] pairs (closed ring). Simple rectangles are fine for v1. */
  polygon: Array<[number, number]>;
  /** What is permitted under this zoning (1-line SA-context note, e.g. "Filling station permitted with consent use", "Industrial uses only") */
  permittedUses?: string;
};

export type MetroZoning = {
  metro: "cape_town" | "johannesburg" | "ethekwini";
  /** Metro centre lat/lng for snap-to-metro routing */
  centre: { lat: number; lng: number };
  zones: ZoningZone[];
};

/** Half-width of the metro bounding box, in degrees. */
export const METRO_BBOX_DEG = 0.5;

type ZoneCategory =
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed_use"
  | "agricultural"
  | "special"
  | "transport";

/**
 * Authoring shape: [name, category, lat, lng, halfDeg, permittedUses].
 * `halfDeg` is the rectangle half-size in degrees (0.010 ≈ 1.1km), so a
 * row describes a ~2x2km block centred on the suburb.
 */
type ZoneRow = [string, ZoneCategory, number, number, number, string];

function toZone([name, category, lat, lng, half, permittedUses]: ZoneRow): ZoningZone {
  return {
    name,
    category,
    permittedUses,
    polygon: [
      [lat - half, lng - half],
      [lat - half, lng + half],
      [lat + half, lng + half],
      [lat + half, lng - half],
      [lat - half, lng - half],
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Cape Town — CoCT Development Management Scheme                      */
/*                                                                     */
/* Rows outside CoCT's jurisdiction (Stellenbosch Municipality) name    */
/* the responsible authority in permittedUses.                         */
/* ------------------------------------------------------------------ */

const CAPE_TOWN_ROWS: ZoneRow[] = [
  // --- City Bowl / Atlantic seaboard
  ["General Business 1 (GB1)", "commercial", -33.9205, 18.4190, 0.010,
    "Shops, offices, restaurants and hotels; filling station with consent use."],
  ["General Business 2 (GB2)", "commercial", -33.9160, 18.4250, 0.008,
    "High-density CBD business, offices and parking; residential above ground floor."],
  ["Mixed Use 3 (MU3)", "mixed_use", -33.9035, 18.4210, 0.008,
    "Retail, tourism, offices and residential in one development; V&A precinct plan applies."],
  ["General Residential 4 (GR4)", "residential", -33.9310, 18.4100, 0.008,
    "Blocks of flats and group housing at high density; no industrial use."],
  ["General Residential 4 (GR4)", "residential", -33.9200, 18.3850, 0.008,
    "High-density flats; ground-floor business only where the scheme overlay allows."],
  ["General Residential 3 (GR3)", "residential", -33.9060, 18.4050, 0.008,
    "Flats and guest houses at medium-high density."],
  ["Single Residential 1 (SR1)", "residential", -33.9510, 18.3770, 0.010,
    "Dwelling house; second dwelling and guest house with consent. No business rights."],
  ["Single Residential 1 (SR1)", "residential", -34.0480, 18.3530, 0.014,
    "Dwelling house; harbour and agricultural pockets zoned separately."],

  // --- Woodstock / Salt River / inner industrial
  ["Mixed Use 2 (MU2)", "mixed_use", -33.9258, 18.4470, 0.008,
    "Business, light industry and residential together; strong adaptive-reuse precedent."],
  ["General Industrial 1 (GI1)", "industrial", -33.9270, 18.4600, 0.008,
    "Industry, warehousing and service trades; filling station permitted."],
  ["General Residential 2 (GR2)", "residential", -33.9370, 18.4720, 0.008,
    "Flats, student accommodation and group housing at medium density."],
  ["General Industrial 1 (GI1)", "industrial", -33.9100, 18.4770, 0.010,
    "Industry, warehousing, transport depots; filling station permitted."],
  ["General Industrial 1 (GI1)", "industrial", -33.9250, 18.4950, 0.008,
    "Industry and warehousing; no new residential."],

  // --- Southern suburbs
  ["Single Residential 1 (SR1)", "residential", -33.9740, 18.4480, 0.008,
    "Dwelling house; local business only on the Main Road overlay."],
  ["General Business 2 (GB2)", "commercial", -33.9870, 18.4640, 0.008,
    "Regional retail, offices and mixed-use towers; filling station with consent use."],
  ["General Residential 2 (GR2)", "residential", -33.9600, 18.4700, 0.008,
    "Flats and student housing; university precinct overlay applies."],
  ["General Residential 2 (GR2)", "residential", -33.9950, 18.4750, 0.008,
    "Flats and group housing at medium density."],
  ["Local Business 2 (LB2)", "commercial", -34.0000, 18.4650, 0.008,
    "Neighbourhood shops, offices and service trades; limited scale."],
  ["Single Residential 2 (SR2)", "residential", -34.0215, 18.4440, 0.014,
    "Large-erf dwelling houses; strict height and coverage limits, no business rights."],
  ["Single Residential 2 (SR2)", "residential", -33.9920, 18.4440, 0.008,
    "Large-erf dwelling houses in a low-density conservation area."],
  ["Single Residential 1 (SR1)", "residential", -34.0150, 18.4700, 0.008,
    "Dwelling house; second dwelling with consent."],
  ["Local Business 1 (LB1)", "commercial", -34.0300, 18.4600, 0.008,
    "Neighbourhood shops and offices serving the immediate catchment."],
  ["Single Residential 1 (SR1)", "residential", -34.0600, 18.4400, 0.010,
    "Dwelling house; adjoining plantation land is Open Space."],
  ["General Business 1 (GB1)", "commercial", -34.0750, 18.4400, 0.008,
    "Retail, motor showrooms and offices; filling station with consent use."],
  ["General Industrial 1 (GI1)", "industrial", -34.0850, 18.4900, 0.008,
    "Light industry, warehousing and service trades."],
  ["General Industrial 1 (GI1)", "industrial", -34.0500, 18.4700, 0.008,
    "Industry and warehousing along the rail corridor."],
  ["Single Residential 1 (SR1)", "residential", -34.0300, 18.4900, 0.010,
    "Dwelling house; wetland buffers are Open Space."],
  ["Local Business 1 (LB1)", "commercial", -34.1050, 18.4700, 0.008,
    "Beachfront shops, restaurants and tourist accommodation."],
  ["Single Residential 1 (SR1)", "residential", -34.1350, 18.4290, 0.010,
    "Dwelling house; coastal setback line applies."],
  ["Rural (RU)", "agricultural", -34.1080, 18.3920, 0.014,
    "Smallholdings, equestrian and agriculture; urban edge restricts subdivision."],
  ["Single Residential 1 (SR1)", "residential", -33.9400, 18.5100, 0.008,
    "Garden-city dwelling houses; heritage overlay limits alteration."],

  // --- Cape Flats / Philippi
  ["General Residential 1 (GR1)", "residential", -33.9700, 18.5100, 0.012,
    "Low-rise flats and group housing; local business on designated corners."],
  ["Single Residential 1 (SR1)", "residential", -34.0400, 18.6180, 0.020,
    "Dwelling house at high density; business rights only on activity streets."],
  ["Single Residential 1 (SR1)", "residential", -34.0400, 18.6800, 0.020,
    "Dwelling house; informal settlement upgrade areas zoned separately."],
  ["Agriculture (AG)", "agricultural", -34.0100, 18.5700, 0.016,
    "Philippi Horticultural Area — agriculture only; rezoning heavily contested."],
  ["General Industrial 1 (GI1)", "industrial", -33.9630, 18.5980, 0.010,
    "Airport-related industry, freight and warehousing; filling station permitted."],
  ["Transport Zone 2 (TR2)", "transport", -33.9690, 18.6020, 0.008,
    "Airport operations under ACSA; no third-party development rights."],
  ["General Industrial 2 (GI2)", "industrial", -33.9370, 18.5450, 0.012,
    "Heavy industry, noxious trades excluded; no residential."],
  ["General Industrial 1 (GI1)", "industrial", -33.9170, 18.5200, 0.010,
    "Industry, warehousing and motor trade; filling station permitted."],
  ["General Industrial 1 (GI1)", "industrial", -34.0100, 18.5100, 0.008,
    "Light industry and service trades."],

  // --- Northern suburbs
  ["Mixed Use 3 (MU3)", "mixed_use", -33.8920, 18.5130, 0.012,
    "Offices, retail and residential under an approved precinct plan."],
  ["Single Residential 1 (SR1)", "residential", -33.8800, 18.4900, 0.010,
    "Dwelling house; canal and coastal setbacks are Open Space."],
  ["Single Residential 1 (SR1)", "residential", -33.8200, 18.4900, 0.012,
    "Dwelling house; local business on the Blaauwberg Road corridor."],
  ["Single Residential 1 (SR1)", "residential", -33.7970, 18.4970, 0.012,
    "Dwelling house; second dwelling with consent."],
  ["Single Residential 1 (SR1)", "residential", -33.7280, 18.4430, 0.010,
    "Dwelling house; coastal management line restricts seaward building."],
  ["General Industrial 1 (GI1)", "industrial", -33.5700, 18.4900, 0.020,
    "Atlantis SEZ — greentech manufacturing, warehousing and industry."],
  ["Local Business 2 (LB2)", "commercial", -33.9100, 18.5500, 0.008,
    "Neighbourhood retail, offices and service trades."],
  ["General Business 1 (GB1)", "commercial", -33.9000, 18.5900, 0.008,
    "Retail and offices on the Voortrekker Road corridor; filling station with consent use."],
  ["General Business 2 (GB2)", "commercial", -33.9020, 18.6300, 0.008,
    "Bellville CBD — high-density offices, retail and transport interchange."],
  ["General Business 2 (GB2)", "commercial", -33.8710, 18.6330, 0.008,
    "Regional shopping and offices; filling station with consent use."],
  ["General Business 1 (GB1)", "commercial", -33.8750, 18.6880, 0.010,
    "Highway-oriented retail and motor trade; filling station with consent use."],
  ["General Industrial 1 (GI1)", "industrial", -33.8850, 18.7000, 0.010,
    "Industry, warehousing and distribution; filling station permitted."],
  ["Single Residential 1 (SR1)", "residential", -33.8385, 18.6510, 0.014,
    "Dwelling house; surrounding wine estates are Agriculture."],
  ["Single Residential 1 (SR1)", "residential", -33.8480, 18.7200, 0.014,
    "Dwelling house; urban edge limits northward expansion."],
  ["Single Residential 1 (SR1)", "residential", -33.9290, 18.7050, 0.014,
    "Dwelling house; local business on the Van Riebeeck Road corridor."],
  ["General Industrial 1 (GI1)", "industrial", -33.9670, 18.6800, 0.012,
    "Industry, warehousing and freight; R300 access."],
  ["Agriculture (AG)", "agricultural", -33.8010, 18.7710, 0.016,
    "Smallholdings and intensive agriculture; subdivision below 5ha refused."],
  ["Agriculture (AG)", "agricultural", -33.6590, 18.5770, 0.020,
    "Swartland grain and livestock farming; outside the urban edge."],

  // --- Helderberg
  ["General Residential 1 (GR1)", "residential", -34.0850, 18.8230, 0.012,
    "Low-rise flats, retirement and group housing."],
  ["General Business 2 (GB2)", "commercial", -34.0800, 18.8400, 0.008,
    "Regional mall and highway retail; filling station with consent use."],
  ["Single Residential 1 (SR1)", "residential", -34.1150, 18.8300, 0.014,
    "Dwelling house; beachfront strip is Local Business."],
  ["Single Residential 1 (SR1)", "residential", -34.1600, 18.8600, 0.012,
    "Dwelling house; coastal setback line applies."],

  // --- Stellenbosch Municipality (not CoCT — authority noted)
  ["Business Zone I", "commercial", -33.9320, 18.8660, 0.012,
    "Stellenbosch Municipality Zoning Scheme: shops, offices and restaurants; heritage overlay."],
  ["Agricultural Zone I", "agricultural", -33.8120, 18.8620, 0.020,
    "Stellenbosch Municipality Zoning Scheme: agriculture and agri-processing; subdivision restricted."],
];

/* ------------------------------------------------------------------ */
/* Johannesburg — CoJ Land Use Scheme 2018                             */
/*                                                                     */
/* Rows in Ekurhuleni jurisdiction name the authority in permittedUses.*/
/* Specific/small zones are listed before the broad ones so the        */
/* first-match lookup returns the tighter answer.                      */
/* ------------------------------------------------------------------ */

const JOHANNESBURG_ROWS: ZoneRow[] = [
  // --- Sandton / northern nodes
  ["Business 1", "commercial", -26.1075, 28.0555, 0.008,
    "Sandton CBD: offices, retail, hotels at maximum bulk; filling station by consent."],
  ["Business 2", "commercial", -26.1030, 28.0625, 0.006,
    "Offices and showrooms with limited retail."],
  ["Residential 1", "residential", -26.1090, 28.0455, 0.006,
    "One dwelling per erf; large-erf conservation area, no business rights."],
  ["Business 2", "commercial", -26.1460, 28.0430, 0.008,
    "Rosebank node: offices, retail and hotels; residential above ground floor."],
  ["Residential 1", "residential", -26.1305, 28.0400, 0.008,
    "One dwelling per erf; consent required for guest house or office conversion."],
  ["Business 3", "commercial", -26.1350, 28.0570, 0.006,
    "Melrose precinct: offices, retail and residential under an approved precinct plan."],
  ["Business 2", "commercial", -26.1300, 28.0530, 0.006,
    "Illovo node: offices and retail on the Oxford corridor."],
  ["Residential 1", "residential", -26.1500, 28.0600, 0.008,
    "One dwelling per erf; low-density suburb, second dwelling with consent."],
  ["Residential 1", "residential", -26.0900, 28.0660, 0.008,
    "One dwelling per erf; townhouse conversion by rezoning only."],
  ["Business 2", "commercial", -26.0530, 28.0540, 0.008,
    "Rivonia node: offices, showrooms and retail; filling station by consent."],
  ["Residential 1", "residential", -26.0490, 28.0290, 0.012,
    "One dwelling per erf on large stands; strong estate/security-village overlay."],
  ["Business 2", "commercial", -26.0140, 28.0100, 0.012,
    "Fourways node: regional retail, offices and mixed-use towers."],
  ["Business 3", "commercial", -26.0450, 28.0850, 0.008,
    "Woodmead: motor showrooms, retail warehousing and offices; filling station permitted."],
  ["Business 2", "commercial", -26.0300, 28.0700, 0.008,
    "Sunninghill: office parks and support retail."],
  ["Residential 2", "residential", -26.0550, 28.1050, 0.008,
    "Townhouses and group housing at medium density."],
  ["Industrial 1", "industrial", -26.0840, 28.1030, 0.008,
    "Marlboro: light industry, warehousing and service trades; filling station permitted."],
  ["Industrial 1", "industrial", -26.0980, 28.0750, 0.006,
    "Kramerville: showrooms, design trade and light industry."],
  ["Industrial 1", "industrial", -26.1050, 28.0900, 0.008,
    "Wynberg: motor trade, warehousing and light industry."],
  ["Industrial 2", "industrial", -26.0780, 28.1900, 0.014,
    "Linbro/Longmeadow: logistics, distribution and general industry."],
  ["Business 2", "commercial", -25.9950, 28.1300, 0.014,
    "Midrand: offices, retail and warehousing along the N1 corridor."],
  ["Agricultural", "agricultural", -25.9940, 28.0710, 0.014,
    "Agricultural holdings; equestrian and smallholding use, township establishment required to develop."],
  ["Transport", "transport", -25.9390, 27.9260, 0.014,
    "Lanseria airport operations; surrounding holdings are Agricultural."],
  ["Residential 4", "residential", -25.9350, 28.0100, 0.014,
    "High-density residential; RDP and mixed-income housing."],
  ["Residential 2", "residential", -25.9460, 27.9460, 0.012,
    "Cosmo City: mixed-income township, townhouses and group housing."],
  ["Business 2", "commercial", -26.0500, 27.9500, 0.010,
    "Northgate node: regional retail and offices; filling station by consent."],
  ["Residential 1", "residential", -26.0400, 27.9200, 0.012,
    "One dwelling per erf; smallholding conversion areas on the western edge."],

  // --- Randburg / western suburbs
  ["Business 1", "commercial", -26.0940, 27.9750, 0.008,
    "Randburg CBD: offices, retail and civic uses."],
  ["Business 2", "commercial", -26.1290, 27.9720, 0.006,
    "Cresta node: regional retail and offices."],
  ["Residential 1", "residential", -26.1600, 27.9720, 0.018,
    "Northcliff/Cresta ridge: one dwelling per erf, ridge protection overlay."],
  ["Business 2", "commercial", -26.1600, 27.8700, 0.014,
    "Roodepoort: retail, offices and civic uses."],
  ["Residential 1", "residential", -26.1600, 28.0100, 0.008,
    "One dwelling per erf; parkland edge is Public Open Space."],
  ["Business 1", "commercial", -26.1385, 28.0010, 0.004,
    "Parkhurst 4th Avenue strip: restaurants, shops and offices."],
  ["Residential 1", "residential", -26.1390, 28.0010, 0.008,
    "One dwelling per erf; business rights confined to the 4th Avenue strip."],
  ["Residential 1", "residential", -26.1450, 28.0200, 0.006,
    "One dwelling per erf; guest house with consent."],
  ["Business 1", "commercial", -26.1820, 28.0050, 0.006,
    "Melville 7th Street strip: restaurants, bars and shops."],
  ["Business 1", "commercial", -26.1660, 28.0660, 0.006,
    "Norwood Grant Avenue strip: restaurants, shops and offices."],

  // --- Inner city
  ["Business 1", "commercial", -26.2070, 28.0460, 0.008,
    "Marshalltown: CBD offices, retail and conversions to residential."],
  ["Business 4", "mixed_use", -26.2030, 28.0500, 0.005,
    "Maboneng precinct: mixed-use conversion, retail, studios and residential."],
  ["Business 2", "commercial", -26.1930, 28.0350, 0.006,
    "Braamfontein: offices, student housing and retail."],
  ["Business 4", "mixed_use", -26.2020, 28.0330, 0.005,
    "Newtown cultural precinct: mixed use with heritage conditions."],
  ["Industrial 1", "industrial", -26.1970, 28.0570, 0.006,
    "Doornfontein: light industry, warehousing and studio conversions."],
  ["Industrial 1", "industrial", -26.2200, 28.0400, 0.008,
    "Selby: warehousing and service industry."],
  ["Industrial 2", "industrial", -26.2200, 28.0320, 0.010,
    "City Deep inland port: container terminal, logistics and general industry."],
  ["Industrial 2", "industrial", -26.2260, 28.0100, 0.012,
    "Crown Mines: general industry and warehousing on old mining land; dolomite risk."],
  ["Industrial 1", "industrial", -26.2400, 28.0180, 0.008,
    "Booysens: light industry and motor trade."],
  ["Business 2", "commercial", -26.2360, 28.0020, 0.008,
    "Southgate node: regional retail and offices."],

  // --- Soweto / southern
  ["Residential 4", "residential", -26.2450, 27.9200, 0.014,
    "High-density township housing; business rights on designated activity streets."],
  ["Residential 2", "residential", -26.2450, 27.9500, 0.012,
    "Diepkloof: townhouses and higher-density housing."],
  ["Residential 4", "residential", -26.2350, 27.8500, 0.014,
    "High-density township housing; consent use required for spaza-to-shop conversion."],
  ["Residential 4", "residential", -26.2200, 27.8380, 0.014,
    "Doornkop: high-density housing and mixed-income development."],
  ["Residential 4", "residential", -26.2650, 27.8600, 0.014,
    "Zola/Emdeni: high-density township housing; business rights on activity streets."],
  ["Residential 1", "residential", -26.2700, 27.8300, 0.014,
    "Protea Glen: one dwelling per erf, township extension areas."],
  ["Residential 2", "residential", -26.2950, 27.8900, 0.014,
    "Eldorado Park: medium-density housing; Golden Highway frontage carries business rights."],
  ["Residential 1", "residential", -26.3300, 27.8300, 0.016,
    "Lenasia: one dwelling per erf; local business nodes on main routes."],
  ["Agricultural", "agricultural", -26.4350, 27.9570, 0.020,
    "Walkerville agricultural holdings; township establishment required to develop."],
  ["Agricultural", "agricultural", -26.0380, 27.8470, 0.016,
    "Muldersdrift agricultural holdings: venues and guest farms by consent use."],
  ["Agricultural", "agricultural", -26.5040, 28.3580, 0.020,
    "Lesedi Local Municipality scheme: agriculture and agri-industry."],

  // --- East / Ekurhuleni edge
  ["Business 2", "commercial", -26.2700, 28.1220, 0.012,
    "Ekurhuleni Town Planning Scheme: Alberton retail, offices and civic uses."],
  ["Industrial 2", "industrial", -26.2700, 28.1900, 0.014,
    "Ekurhuleni scheme: Wadeville/Alrode heavy industry and logistics."],
  ["Industrial 2", "industrial", -26.1900, 28.1900, 0.012,
    "Ekurhuleni scheme: Elandsfontein rail-served industry and warehousing."],
  ["Residential 1", "residential", -26.1800, 28.1110, 0.010,
    "Bedfordview: one dwelling per erf on large stands; office conversion by consent."],
  ["Business 2", "commercial", -26.1400, 28.1550, 0.010,
    "Ekurhuleni scheme: Edenvale retail and offices."],
  ["Transport", "transport", -26.1330, 28.2320, 0.008,
    "OR Tambo International: airport operations under ACSA, no third-party rights."],
  ["Residential 1", "residential", -26.1400, 28.2450, 0.008,
    "Ekurhuleni scheme: Bonaero Park one dwelling per erf; aircraft noise contour applies."],
  ["Business 2", "commercial", -26.1000, 28.2300, 0.012,
    "Ekurhuleni scheme: Kempton Park retail, offices and airport support."],
];

/* ------------------------------------------------------------------ */
/* eThekwini — eThekwini Town Planning Scheme                          */
/* ------------------------------------------------------------------ */

const ETHEKWINI_ROWS: ZoneRow[] = [
  // --- Durban CBD / beachfront
  ["General Commercial", "commercial", -29.8570, 31.0250, 0.012,
    "CBD retail, offices and hotels; filling station by special consent."],
  ["Mixed Use", "mixed_use", -29.8690, 31.0450, 0.008,
    "Point waterfront: tourism, residential and retail under the precinct plan."],
  ["General Industrial", "industrial", -29.8800, 31.0200, 0.010,
    "Maydon Wharf port industry, bulk storage and logistics; Transnet leasehold."],
  ["Residential 6", "residential", -29.8510, 30.9980, 0.006,
    "Musgrave: flats and higher-density residential; medical suites by consent."],
  ["Residential 6", "residential", -29.8500, 30.9950, 0.010,
    "Berea: flats and group housing; heritage overlay on the ridge."],
  ["Residential 4", "residential", -29.8640, 30.9850, 0.008,
    "Glenwood: medium-density housing and student accommodation."],
  ["Residential 6", "residential", -29.8350, 31.0200, 0.010,
    "Morningside: flats and townhouses; local commercial on Florida Road."],
  ["Light Industrial", "industrial", -29.8180, 31.0230, 0.008,
    "Umgeni Business Park: warehousing, motor trade and service industry."],
  ["Light Industrial", "industrial", -29.8100, 31.0100, 0.008,
    "Springfield Park: warehousing and showrooms; flood line restricts coverage."],
  ["Light Industrial", "industrial", -29.7850, 30.9950, 0.008,
    "Riverhorse Valley: logistics, distribution and business park."],
  ["Light Industrial", "industrial", -29.7900, 31.0100, 0.006,
    "Briardene: light industry and warehousing."],
  ["Local Commercial", "commercial", -29.7800, 31.0200, 0.006,
    "Greenwood Park: neighbourhood retail and service trades."],

  // --- North coast corridor
  ["Residential 1", "residential", -29.7620, 31.0400, 0.010,
    "Durban North: one dwelling per erf; consent use for guest house."],
  ["Residential 1", "residential", -29.7520, 31.0660, 0.008,
    "La Lucia: one dwelling per erf; coastal setback applies."],
  ["Mixed Use", "mixed_use", -29.7280, 31.0660, 0.008,
    "Umhlanga Ridge Town Centre: offices, retail and residential at high density."],
  ["General Commercial", "commercial", -29.7250, 31.0620, 0.005,
    "Gateway precinct: regional retail, offices and hotels."],
  ["Residential 7", "residential", -29.7250, 31.0850, 0.006,
    "Umhlanga Rocks: high-density flats and hotels on the beachfront."],
  ["Special Zone", "special", -29.7150, 31.0530, 0.008,
    "Mt Edgecombe: golf-estate special zone under an approved development framework."],
  ["Mixed Use", "mixed_use", -29.7050, 31.0650, 0.020,
    "Cornubia integrated development: residential, industrial and commercial phases."],
  ["Agriculture", "agricultural", -29.6250, 31.0800, 0.016,
    "Tongaat sugarcane land; township establishment required before development."],
  ["Special Zone", "special", -29.6290, 31.0600, 0.012,
    "Dube TradePort SEZ: agrizone, trade zone and airport-linked logistics."],
  ["Transport", "transport", -29.6140, 31.1200, 0.010,
    "King Shaka International: airport operations under ACSA."],
  ["General Commercial", "commercial", -29.6470, 31.0500, 0.008,
    "Verulam: town-centre retail, offices and taxi facilities."],
  ["Agriculture", "agricultural", -29.6700, 31.0250, 0.010,
    "Ottawa: cane land and smallholdings on the urban edge."],
  ["Residential 4", "residential", -29.7000, 31.0100, 0.014,
    "Phoenix: medium-density housing; business rights on main routes."],
  ["Residential 4", "residential", -29.7450, 30.9800, 0.014,
    "KwaMashu: high-density township housing; activity-street business rights."],
  ["Residential 9", "residential", -29.7100, 30.9300, 0.016,
    "Inanda: traditional/informal settlement upgrade area; land tenure to be verified."],
  ["Residential 4", "residential", -29.7700, 30.9900, 0.010,
    "Newlands East: medium-density housing."],
  ["General Residential", "residential", -29.5390, 31.2140, 0.014,
    "KwaDukuza Municipality scheme: Ballito flats, resorts and estate housing."],

  // --- Inner west
  ["Residential 1", "residential", -29.8420, 30.9320, 0.020,
    "Westville: one dwelling per erf; office conversion on Jan Hofmeyr by consent."],
  ["General Commercial", "commercial", -29.8060, 30.8640, 0.010,
    "Pinetown CBD: retail, offices and transport interchange."],
  ["General Industrial", "industrial", -29.8000, 30.8850, 0.010,
    "New Germany: general industry and warehousing."],
  ["Light Industrial", "industrial", -29.8200, 30.8300, 0.010,
    "Mariannhill: light industry and logistics off the N3."],
  ["Residential 1", "residential", -29.7810, 30.8440, 0.012,
    "Kloof: one dwelling per erf on large stands; gorge edge is Public Open Space."],
  ["Residential 1", "residential", -29.7810, 30.7660, 0.014,
    "Hillcrest: one dwelling per erf; estate and retail nodes on the M13."],
  ["Residential 1", "residential", -29.7900, 30.8000, 0.008,
    "Gillitts: one dwelling per erf, low-density conservation character."],
  ["Residential 1", "residential", -29.7500, 30.8100, 0.010,
    "Waterfall: one dwelling per erf; smallholding conversion areas."],
  ["General Industrial", "industrial", -29.7950, 30.6250, 0.014,
    "Hammarsdale: general industry, textiles and logistics."],
  ["General Industrial", "industrial", -29.7500, 30.5700, 0.014,
    "Cato Ridge: inland logistics hub, general industry and freight terminals."],
  ["Residential 1", "residential", -29.8600, 30.8900, 0.010,
    "Queensburgh: one dwelling per erf; local commercial on Main Road."],
  ["Residential 1", "residential", -29.8700, 30.9200, 0.008,
    "Malvern: one dwelling per erf; second dwelling with consent."],

  // --- South
  ["Residential 1", "residential", -29.9300, 31.0100, 0.012,
    "Bluff: one dwelling per erf; harbour edge is industrial."],
  ["Residential 1", "residential", -29.9100, 30.9500, 0.008,
    "Yellowwood Park: one dwelling per erf; nature reserve buffer."],
  ["Residential 4", "residential", -29.9450, 30.9800, 0.008,
    "Wentworth: medium-density housing; refinery buffer conditions apply."],
  ["Residential 4", "residential", -29.9720, 30.9640, 0.008,
    "Merebank: medium-density housing adjoining the industrial basin."],
  ["General Industrial", "industrial", -29.9700, 30.9450, 0.010,
    "Prospecton: heavy industry, automotive assembly and logistics."],
  ["Light Industrial", "industrial", -29.9890, 30.9490, 0.008,
    "Isipingo: light industry, warehousing and service trades."],
  ["General Industrial", "industrial", -30.0200, 30.9200, 0.008,
    "Umbogintwini industrial complex: chemicals and general industry; risk buffer applies."],
  ["Residential 4", "residential", -29.9200, 30.8800, 0.016,
    "Chatsworth: medium-density housing; business rights at designated nodes."],
  ["Residential 4", "residential", -29.9600, 30.8800, 0.016,
    "Umlazi: high-density township housing; activity-street business rights."],
  ["Residential 1", "residential", -30.0520, 30.9000, 0.014,
    "Amanzimtoti: one dwelling per erf; beachfront strip is General Commercial."],
  ["Residential 1", "residential", -30.0900, 30.8900, 0.010,
    "Warner Beach: one dwelling per erf; coastal setback line applies."],
];

export const SA_METRO_ZONING: MetroZoning[] = [
  {
    metro: "cape_town",
    centre: { lat: -33.9249, lng: 18.4241 },
    zones: CAPE_TOWN_ROWS.map(toZone),
  },
  {
    metro: "johannesburg",
    centre: { lat: -26.2041, lng: 28.0473 },
    zones: JOHANNESBURG_ROWS.map(toZone),
  },
  {
    metro: "ethekwini",
    centre: { lat: -29.8587, lng: 31.0218 },
    zones: ETHEKWINI_ROWS.map(toZone),
  },
];

/**
 * Standard ray-casting point-in-polygon. Ring is [lat, lng] pairs, so
 * lat plays the role of y and lng of x.
 */
function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const straddles = latI > lat !== latJ > lat;
    if (!straddles) continue;
    const lngAtLat = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (lng < lngAtLat) inside = !inside;
  }
  return inside;
}

/** The metro block for a metro id, or undefined. */
export function getMetroZoning(
  metro: MetroZoning["metro"],
): MetroZoning | undefined {
  return SA_METRO_ZONING.find((m) => m.metro === metro);
}

/**
 * Which metro (if any) a point belongs to — nearest centre within the
 * metro bounding box. Returns null for anything outside all three.
 */
export function findMetroFor(
  lat: number,
  lng: number,
): MetroZoning | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { metro: MetroZoning; d: number } | null = null;
  for (const m of SA_METRO_ZONING) {
    const dLat = Math.abs(lat - m.centre.lat);
    const dLng = Math.abs(lng - m.centre.lng);
    if (dLat > METRO_BBOX_DEG || dLng > METRO_BBOX_DEG) continue;
    // Squared degree distance is enough to pick a winner here.
    const d = dLat * dLat + dLng * dLng;
    if (!best || d < best.d) best = { metro: m, d };
  }
  return best ? best.metro : null;
}

/**
 * The zone covering a point in the given metro, or null.
 *
 * Points outside the metro bounding box are rejected before any
 * polygon test — a Cape Town coordinate must never come back with a
 * Johannesburg zone just because the caller passed the wrong metro id.
 * Zones are tested in table order, and the tables list specific/small
 * zones (business strips, precincts) before the broad suburb blocks
 * they sit inside, so the first match is the tighter answer.
 */
export function findZoning(
  metro: MetroZoning["metro"],
  lat: number,
  lng: number,
): ZoningZone | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const block = getMetroZoning(metro);
  if (!block) return null;

  if (
    Math.abs(lat - block.centre.lat) > METRO_BBOX_DEG ||
    Math.abs(lng - block.centre.lng) > METRO_BBOX_DEG
  ) {
    return null;
  }

  for (const zone of block.zones) {
    if (pointInPolygon(lat, lng, zone.polygon)) return zone;
  }
  return null;
}

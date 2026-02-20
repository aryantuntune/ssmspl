"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContactInfo {
  label: string;
  phones: string[];
}

interface RouteInfo {
  name: string;
  subtitle: string;
  image: string | null;
  about: string[];
  tourist: string;
  contacts: ContactInfo[];
  timetableImage?: string;
  ratecardImage?: string;
}

/* ------------------------------------------------------------------ */
/*  Route Data                                                         */
/* ------------------------------------------------------------------ */

const ROUTE_DATA: Record<string, RouteInfo> = {
  "dabhol-dhopave": {
    name: "Dabhol \u2013 Dhopave",
    subtitle: "Maharashtra\u2019s First Ferry Service Since 2003",
    image: "/images/routes/dabhol-dhopave.jpg",
    about: [
      "The Dabhol-Dhopave ferry service is the very first site which was started on 21.10.2003 and has been constantly working at all times and in all seasons since its first day.",
      "This ferry connects Dabhol (near Dapoli) and Dhopave (near Guhagar) in Maharashtra\u2019s Ratnagiri district. The service provides a crucial link between these two coastal destinations, reducing travel time significantly compared to road-only routes.",
      "The ferry service was started by Suvarnadurga Shipping & Marine Services Pvt. Ltd. as the first Ferry Boat Service in Maharashtra, eliminating the need for expensive and time-consuming highway travel.",
    ],
    tourist:
      "Nearby attractions include temples, forts, and agricultural institutions. The route is popular among tourists visiting the Konkan coast and offers a scenic journey across the waters.",
    contacts: [
      { label: "Dabhol Office", phones: ["02348-248900", "9767248900"] },
      { label: "Dhopave", phones: ["7709250800"] },
    ],
    timetableImage: "/images/timetables/dabhol-dhopave.jpg",
    ratecardImage: "/images/ratecards/dabhol.jpg",
  },
  "jaigad-tawsal": {
    name: "Jaigad \u2013 Tawsal",
    subtitle: "Easy & Better Transportation to Ratnagiri",
    image: "/images/routes/jaigad-tawsal.jpg",
    about: [
      "This Ferry service was started for the easy & better transportation from Guhaghar to the Ratnagiri region. The service makes these areas easily accessible from Ratnagiri (Kolhapur region) as well as from Pune and Mumbai.",
      "The ferry was established by Suvarnadurga Shipping & Marine Services to enable transportation from Guhaghar to Ratnagiri, subsequently boosting tourism and commerce in the region.",
      "The route has become popular among both tourists and locals, providing a convenient and scenic alternative to road travel.",
    ],
    tourist:
      "Nearby tourist destinations include Ganpati Pule, Thiba Palace, Bhate beach, and Pawas. The service benefits fishing operations and economic accessibility to Ratnagiri district.",
    contacts: [
      { label: "Jaigad", phones: ["02354-242500", "8550999884"] },
      { label: "Tawsal", phones: ["8550999880"] },
    ],
    timetableImage: "/images/timetables/jaigad-tawsal.jpg",
    ratecardImage: "/images/ratecards/jaigad.jpg",
  },
  "dighi-agardande": {
    name: "Dighi \u2013 Agardande",
    subtitle: "Direct NH-17 Connectivity",
    image: "/images/routes/dighi-agardande.jpg",
    about: [
      "The Dighi-Agardande ferry service connects two coastal locations in Maharashtra, facilitating tourism and commercial fishing by providing direct access to National Highway 17.",
      "This route enables easy access to destinations like Murud-Janjeera, Kashid beach, and Alibaug. It also supports the local fishing industry by providing market access for commercially valuable fish species including Pomfret, Rawas, and Prawns.",
      "Previously, local fishermen lacked viable markets; the ferry service now enables distribution to Mumbai and other destinations through improved transportation connectivity.",
    ],
    tourist:
      "The route represents infrastructure development addressing historical limitations. Tourism development is focused on nearby attractions and beaches.",
    contacts: [
      { label: "Dighi", phones: ["9156546700"] },
      { label: "Agardande", phones: ["8550999887"] },
    ],
  },
  "veshvi-bagmandale": {
    name: "Veshvi \u2013 Bagmandale",
    subtitle: "Quick Journey from Raigad to Ratnagiri",
    image: "/images/routes/veshvi-bagmandale.jpg",
    about: [
      "Operating since 2007, the Veshvi-Bagmandale ferry made the journey from Raigad to Ratnagiri very easy and quick, eliminating lengthy travel via Mandangad.",
      "This ferry service connects to nearby attractions including Harihareshwar, Kelshi\u2019s Mahalaxmi Temple, and Suvarnadurga Fort. It suggests multi-destination itineraries combining the ferry with other Konkan region beaches and historical sites.",
      "The service connects to nearby ferry options including the Rohini-Agardanda route as an alternative for travelers.",
    ],
    tourist:
      "Popular destinations accessible via this route include Harihareshwar beach, various temples, and the historic Suvarnadurga Fort.",
    contacts: [
      { label: "Veshvi Office", phones: ["02350-223300"] },
      { label: "Bagmandale", phones: ["9322819161"] },
    ],
  },
  "vasai-bhayander": {
    name: "Vasai \u2013 Bhayander",
    subtitle: "RORO Service Under Sagarmala Project",
    image: "/images/routes/vasai-bhayander.jpg",
    about: [
      "This is Suvarnadurga Shipping\u2019s seventh ferry route, connecting Vasai and Bhayander in Maharashtra. The company recently began operations on this route, which operates under the Sagarmala Project with provisional authorization from the Maharashtra Maritime Board.",
      "The service is a RORO (Roll-on/Roll-off) operation, following the company\u2019s 21+ years of experience with similar services. Vasai has historical significance with Vasai Fort and Portuguese cultural heritage, with potential for tourism development.",
      "Bhayander is positioned as a major marketplace with good connectivity, experiencing rapid growth. Schedules may vary based on tide levels, with separate timetables for weekdays and weekends.",
    ],
    tourist:
      "The route has potential for fruit trading expansion and tourism development due to its proximity to historical sites.",
    contacts: [
      { label: "Contact 1", phones: ["8624063900"] },
      { label: "Contact 2", phones: ["8600314710"] },
    ],
  },
  "ambet-mahpral": {
    name: "Ambet \u2013 Mahpral",
    subtitle: "Connecting Coastal Communities",
    image: "/images/routes/ambet-mahpral.jpg",
    about: [
      "The Ambet-Mahpral ferry service connects these coastal communities, providing reliable ferry services for passengers and vehicles.",
      "This route is part of Suvarnadurga Shipping\u2019s extensive network across the Konkan coast, supporting local communities and promoting regional connectivity.",
      "The ferry service has become an important transportation link, reducing travel time and providing a scenic journey for passengers.",
    ],
    tourist:
      "The route serves local communities and tourists exploring the Konkan coast.",
    contacts: [
      { label: "General Enquiry", phones: ["+91 9422431371"] },
    ],
  },
  "virar-saphale": {
    name: "Virar \u2013 Saphale (Jalsar)",
    subtitle: "Connecting Virar and Saphale",
    image: null,
    about: [
      "The Virar-Saphale ferry service, also known as Jalsar, connects these two locations providing an alternative to road travel.",
      "This route is part of Suvarnadurga Shipping\u2019s network of ferry services across the Maharashtra coast, providing reliable transportation for both passengers and vehicles.",
      "The service operates regularly and has become an important link for commuters and tourists in the region.",
    ],
    tourist: "Contact us for current schedules and fares.",
    contacts: [
      { label: "General Enquiry", phones: ["+91 9422431371"] },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  SVG Icon Components                                                */
/* ------------------------------------------------------------------ */

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M1.5 6.375c0-1.036.84-1.875 1.875-1.875h17.25c1.035 0 1.875.84 1.875 1.875v3.026a.75.75 0 01-.375.65 2.249 2.249 0 000 3.898.75.75 0 01.375.65v3.026c0 1.035-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 17.625v-3.026a.75.75 0 01.374-.65 2.249 2.249 0 000-3.898.75.75 0 01-.374-.65V6.375zm15-1.125a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75zm.75 4.5a.75.75 0 00-1.5 0v.75a.75.75 0 001.5 0v-.75zm-.75 3a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75zm.75 4.5a.75.75 0 00-1.5 0V18a.75.75 0 001.5 0v-.75zM6 12a.75.75 0 01.75-.75H12a.75.75 0 010 1.5H6.75A.75.75 0 016 12zm.75 2.25a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function RoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const route = ROUTE_DATA[slug];

  if (!route) {
    notFound();
  }

  const otherRoutes = Object.entries(ROUTE_DATA).filter(
    ([key]) => key !== slug,
  );

  const hasScheduleSection = Boolean(
    route.timetableImage || route.ratecardImage,
  );

  return (
    <div>
      {/* ============================================================ */}
      {/* 1. Blue Banner Section                                        */}
      {/* ============================================================ */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-gradient-to-br from-[#0c3547] to-[#1a6b8a]">
        {/* Decorative wave overlay */}
        <div className="absolute inset-0 opacity-10">
          <svg
            className="absolute bottom-0 w-full"
            viewBox="0 0 1440 120"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M0 60C240 120 480 0 720 60C960 120 1200 0 1440 60V120H0V60Z"
              fill="white"
            />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">
            {route.name}
          </h1>
          <p className="text-lg md:text-xl text-cyan-100 mb-6">
            {route.subtitle}
          </p>

          {/* Breadcrumb */}
          <nav className="flex items-center justify-center gap-1 text-sm">
            <Link
              href="/"
              className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
            >
              Home
            </Link>
            <ChevronRightIcon className="w-4 h-4 text-cyan-300" />
            <Link
              href="/#routes"
              className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
            >
              Ferry Services
            </Link>
            <ChevronRightIcon className="w-4 h-4 text-cyan-300" />
            <span className="text-white">{route.name}</span>
          </nav>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. Two-Column Content Section                                 */}
      {/* ============================================================ */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {/* ---- Left Column (2/3) ---- */}
            <div className="lg:col-span-2 space-y-10">
              {/* About This Route */}
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                  About This Route
                </h2>
                <div className="w-16 h-1 bg-amber-500 rounded-full mb-6" />

                <div className="space-y-4">
                  {route.about.map((paragraph, idx) => (
                    <p
                      key={idx}
                      className="text-gray-600 leading-relaxed text-base"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Route Image */}
              {route.image && (
                <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden shadow-lg">
                  <Image
                    src={route.image}
                    alt={route.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 66vw"
                    priority
                  />
                </div>
              )}

              {/* Tourist Destinations */}
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                  Tourist Destinations
                </h2>
                <div className="w-16 h-1 bg-amber-500 rounded-full mb-6" />

                <div className="bg-sky-50 border border-sky-100 rounded-xl p-6">
                  <div className="flex gap-3">
                    <MapPinIcon className="w-6 h-6 text-sky-600 shrink-0 mt-0.5" />
                    <p className="text-gray-600 leading-relaxed">
                      {route.tourist}
                    </p>
                  </div>
                </div>
              </div>

              {/* Schedule & Rates */}
              {hasScheduleSection && (
                <ScheduleAndRates
                  timetableImage={route.timetableImage}
                  ratecardImage={route.ratecardImage}
                  routeName={route.name}
                />
              )}
            </div>

            {/* ---- Right Column (1/3) - Sticky Sidebar ---- */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-6 space-y-6">
                {/* Contact Information Card */}
                <div className="bg-white rounded-xl shadow-md ring-1 ring-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-[#0c3547] to-[#1a6b8a] px-5 py-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <PhoneIcon className="w-5 h-5 text-amber-400" />
                      Contact Information
                    </h3>
                  </div>
                  <div className="p-5 space-y-5">
                    {route.contacts.map((contact, idx) => (
                      <div key={idx}>
                        <p className="text-sm font-semibold text-slate-900 mb-2">
                          {contact.label}
                        </p>
                        <div className="space-y-2">
                          {contact.phones.map((phone) => (
                            <a
                              key={phone}
                              href={`tel:${phone.replace(/[\s-]/g, "")}`}
                              className="flex items-center gap-2.5 text-sm text-sky-600 hover:text-sky-800 transition-colors group"
                            >
                              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 group-hover:bg-sky-100 transition-colors">
                                <PhoneIcon className="w-4 h-4" />
                              </span>
                              {phone}
                            </a>
                          ))}
                        </div>
                        {idx < route.contacts.length - 1 && (
                          <div className="border-b border-gray-100 mt-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Operating Hours Card */}
                <div className="bg-white rounded-xl shadow-md ring-1 ring-gray-100 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-50 shrink-0">
                      <ClockIcon className="w-5 h-5 text-amber-500" />
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-900 mb-1">
                        Operating Hours
                      </h3>
                      <p className="text-sm text-gray-600 font-medium">
                        Daily Service
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Check timetable for schedule
                      </p>
                    </div>
                  </div>
                </div>

                {/* Book Your Ticket Card */}
                <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <TicketIcon className="w-6 h-6" />
                    <h3 className="text-lg font-bold">Book Your Ticket</h3>
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed mb-5">
                    Skip the queue! Book your ferry ticket online and travel
                    hassle-free.
                  </p>
                  <Link
                    href="/customer/login"
                    className="inline-flex items-center gap-2 bg-white text-amber-600 hover:text-amber-700 font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-lg text-sm w-full justify-center"
                  >
                    Book Now
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. Explore Other Routes Section                               */}
      {/* ============================================================ */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <span className="inline-block text-sky-600 bg-sky-50 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full mb-3">
              More Routes
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
              Explore Other Routes
            </h2>
            <div className="w-16 h-1 bg-amber-500 rounded-full mx-auto mt-3" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {otherRoutes.map(([routeSlug, routeData]) => (
              <Link
                key={routeSlug}
                href={`/route/${routeSlug}`}
                className="group block bg-white rounded-xl shadow-md ring-1 ring-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                {/* Card image or placeholder */}
                <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#0c3547] to-[#1a6b8a]">
                  {routeData.image ? (
                    <Image
                      src={routeData.image}
                      alt={routeData.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <svg
                        className="w-16 h-16 text-white/20"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v-2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>

                <div className="p-5">
                  <h4 className="text-base font-bold text-amber-700 mb-1 group-hover:text-amber-600 transition-colors">
                    {routeData.name}
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed mb-3">
                    {routeData.subtitle}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 group-hover:text-sky-700 transition-colors">
                    View Details
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Schedule & Rates Sub-component (uses useState for tabs)            */
/* ------------------------------------------------------------------ */

function ScheduleAndRates({
  timetableImage,
  ratecardImage,
  routeName,
}: {
  timetableImage?: string;
  ratecardImage?: string;
  routeName: string;
}) {
  const tabs: { key: string; label: string; image: string }[] = [];

  if (timetableImage) {
    tabs.push({
      key: "timetable",
      label: "Ferry Time Table",
      image: timetableImage,
    });
  }
  if (ratecardImage) {
    tabs.push({
      key: "ratecard",
      label: "Ferry Rate Card",
      image: ratecardImage,
    });
  }

  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "");

  if (tabs.length === 0) return null;

  const activeImage = tabs.find((t) => t.key === activeTab)?.image;

  return (
    <div>
      <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
        Schedule &amp; Rates
      </h2>
      <div className="w-16 h-1 bg-amber-500 rounded-full mb-6" />

      {/* Tab Buttons */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 rounded-md text-sm font-semibold transition-all cursor-pointer ${
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeImage && (
        <div className="relative w-full rounded-xl overflow-hidden shadow-lg border border-gray-100">
          <Image
            src={activeImage}
            alt={`${routeName} - ${
              activeTab === "timetable" ? "Time Table" : "Rate Card"
            }`}
            width={800}
            height={600}
            className="w-full h-auto object-contain"
            sizes="(max-width: 1024px) 100vw, 66vw"
          />
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-4 text-sm text-gray-400 italic flex items-start gap-2">
        <span className="text-amber-500 font-bold mt-px">*</span>
        Schedules may vary based on weather and tide conditions. Please call to
        confirm.
      </p>
    </div>
  );
}

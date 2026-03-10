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
  status?: "open" | "closed";
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
    subtitle: "Making it convenient to travel from Dapoli to Guhagar or vice versa through road and ferry combination.",
    image: "/images/routes/dabhol-dhopave.jpg",
    about: [
      "The very first site started by Suvarnadurga shipping & Marine Services Pvt. Ltd. Since 21st October 2003, this ferryboat service is constantly busy and has continued its service irrespective of adverse weather conditions.",
      "Dabhol is twenty-seven kilometers away from Dapoli. Both these destinations have great places to visit and marvelous tourist spots. Dapoli, also called as Mini \u2013 Mahabaleshwar because of its cool & soothing environment. Fresh Seafood is Dapoli\u2019s specialty.",
      "Dapoli is also famous for \u2018Kokan Krishi Vidyapeeth\u2019 an Agricultural University. Dapoli Homeopathic Medical College, Agril. Engineering College and some other educational institutes have made Dapoli the greatest educational hub. As far as road distance is concerned, approximate distance from following locations to Dapoli is as Mumbai-220 km, Poona-220 km, Kolhapur-220 km, Satara- 150 km, Sangali -180 km, Mahabalshwar \u2013 100 km.",
      "Guhaghar is a lovely location along with amazing clean beaches & temples. It is also known for ENRON Power Project. Famous \u2018Gopal Gad\u2019 fort is located at Hedvi, near Guhaghar. Velneshwar is one of the favorite destinations you may visit. \u2018GanpatiPule\u2019, Ratnagiri is mere 66 kilometers from Guhaghar. Dhopave is fourteen kilometers from Guhagar for the Ferry destination. Guhagar is easily approachable from Poona :270 km, Mumbai: 270 km, Kolhapur: 180 km, Satara: 150 km, Karad :100 km, Sangali-130 km.",
      "Dapoli & Guhaghar were not easily accessible before ferry boat service. Now, it is very convenient to travel from Dapoli to Guhagar or vice versa through road and ferry combination. A sweet & short Holiday Package with nice seafood & konkani food thus can be arranged for these locations & this has become possible due to ferry service.",
      "Ferries are connected with each other too. You have choice of Dabhol- Dhopave Ferry for Ratnagiri visit, ferry service at Tawsal -Jaigad (Guhagar \u2013Ratnagiri). Shriwardhan, Harihareshwar, Dive-Agar can be visited through Veshvi \u2013 Bagmandale (Mandangad-Dapoli \u2013 Raigad). You may extend your route up to Alibaug, Murud janjeera through Rohini- Agardanda Ferry boat Service (Shrivardhan \u2013 Murud, Raigad). Thus, this ferry service proves to be miraculously useful to connect the dots through your destination routes!",
    ],
    tourist:
      "Nearby tourist destinations include resorts, lake resorts, hotels, bungalows & second homes. Home stay with home food is one of the concepts you may try at Guhagar. Popular spots include Velneshwar temple, Gopal Gad Fort, Kokan Krishi Vidyapeeth, and the scenic beaches of both Dapoli and Guhaghar.",
    contacts: [
      { label: "Dabhol Office", phones: ["02348-248900", "9767248900"] },
      { label: "Dhopave", phones: ["7709250800"] },
    ],
    timetableImage: "/images/timetables/dabhol-dhopave.jpg",
    ratecardImage: "/images/ratecards/dabhol.jpg",
  },
  "jaigad-tawsal": {
    name: "Jaigad \u2013 Tawsal",
    subtitle: "Places like Ganpati Pule, Thiba Palace, Bhate beach, Pawas are one of the most sought after destinations.",
    image: "/images/routes/jaigad-tawsal.jpg",
    about: [
      "Easy transportation from Guhaghar to Ratnagiri was the main aim while Suvarnadurga Shipping & Marine Services Pvt. Ltd. started this ferry service. Due to this Ferry, Guhagar became easily accessible from Ratnagiri (Kolhapur region) as well as from Pune and Mumbai. Ever since then, Guhaghar has flourished as a great tourists destination. Even educational organizations have been showing interest in Guhaghar. Recently, well equipped Engineering College was also started in Velaneshwar.",
      "Guhaghar is a lovely location along with amazing clean beaches & temples. It is also known for ENRON Power Project. Famous \u2018Gopal Gad\u2019 fort is located at Hedvi, near Guhaghar. Velneshwar is one of favourite destinations you may visit. Hedvi beach, Vyadeshwar Mandir, Durga Devi Mandir are the main attractions. \u2018GanpatiPule\u2019, Ratnagiri is mere 66 kilometers from Guhaghar. Guhagar is easily approachable from Poona :270 kms, Mumbai: 270kms, Kolhapur: 180kms, Satara: 150kms, Karad :100kms, Sangali-130kms.",
      "Another miracle took place because of this service was that; because of this ferry service, fishing business proliferated by leaps and bounds due to very easy transportation of fish containers. Reachability to Ratnagiri from Guhaghar and vice versa was possible within very short time span as compared to previous methods of transportation. From Ratnagiri, fish can be transported further to Goa or Mangalore (Kerala) for further sale or processing.",
      "District place like Ratnagiri became easily accessible from Guhagar and Dabhol as well because of the ferry service. Ratnagiri, has quite a number of tourists places and the city is also being developed very fast. Places like famous Ganpati Pule Mandir, Thiba Palace, Bahte beach, Pawas are one of the most sought after destinations by tourists who visit Ratnagiri.",
      "Visiting such destinations through ferry is really a very lovely experience. Saved time, fuel and money is added bonus..!!",
    ],
    tourist:
      "Famous Ganpati Pule Mandir, Thiba Palace, Bahte beach, Pawas, Hedvi beach, Vyadeshwar Mandir, Durga Devi Mandir, Velneshwar temple, and the Engineering College at Velaneshwar. The service benefits fishing operations and economic accessibility to Ratnagiri district.",
    contacts: [
      { label: "Jaigad", phones: ["02354-242500", "8550999884"] },
      { label: "Tawsal", phones: ["8550999880"] },
    ],
    timetableImage: "/images/timetables/jaigad-tawsal.jpg",
    ratecardImage: "/images/ratecards/jaigad.jpg",
  },
  "dighi-agardande": {
    name: "Dighi \u2013 Agardande",
    subtitle: "One of the advantages of this ferry service is that, you get directly connected to NH-17",
    image: "/images/routes/dighi-agardande.jpg",
    about: [
      "Development of tourism and fishing is the main aim of this ferry service. As this location happens to be near Mumbai, it is a great boon to Mumbaites, because Alibaug, one of their favourite destinations is now within the reach because of this exciting service. Locations like Murud- Janjeera, Kashid beach (famous for bird watching) can be covered easily.",
      "Fish like Pomfret, Rawas, Prawns are abundantly available in Dighi Creek. Previously local fishermen had no market for these commercially valuable fish family. Ferry service has changed the whole scenario. Now, because of better and easy transportation facility, fresh fish can be made available from Deghee to Alibag, Mumbai and some other destinations.",
      "One of the advantages of this ferry service is that, you get directly connected to NH-17 and then either to Murud \u2013 Janjeera, Rewas, or to Harihareshwar and Shrivardhan. Ferry service link to Veshvi- bagmandale, Dabhol \u2013 Dhopave & Tawsal \u2013 Jaigad gives a memorable experience.",
    ],
    tourist:
      "Key destinations include Murud-Janjeera Fort, Kashid Beach (famous for bird watching), Alibaug, Harihareshwar, Shrivardhan, and Rewas. The route connects to NH-17, providing easy access to these attractions.",
    contacts: [
      { label: "Dighi", phones: ["9156546700"] },
      { label: "Agardande", phones: ["8550999887"] },
    ],
    timetableImage: "/images/timetables/dighi-agardande.png",
    ratecardImage: "/images/ratecards/dighi.jpg",
  },
  "veshvi-bagmandale": {
    name: "Veshvi \u2013 Bagmandale",
    subtitle: "Since 2007, this ferry service has made the journey from Raigad to Ratnagiri very easy and quick.",
    image: "/images/routes/veshvi-bagmandale.jpg",
    about: [
      "This ferry service was started by Suvarnadurga Shipping & Marine Services Pvt. Ltd. in 2007. Till then, journey from Raigad to Ratnagiri via Mandangad was very time consuming and hectic.",
      "There are some tourist spots at Shrivardhan such as Harihareshwar, Dive-Aagar, Borli etc. Velas beach is famous for its \u2018Kasav Mahotsav\u2019 (Turtle Festival). Once you are there, you have a choice visit Dapoli or Murud, Alibaug for their exotic locations.",
      "You may arrange your tour as Veshvi \u2013 Kelshi (Mahalaxmi Temple) \u2013 Anjarle Beach \u2013 Harnai Beach \u2013 Suvarnadurga Fort \u2013 Murud (Dapoli) beach \u2013 Dapoli (Konkan Krishi Vidyapeeth) \u2013 Ladghar beach \u2013 Burondi (Lord Parshuram Statue) \u2013 Kolthare Beach \u2013 Kolishwar Temple \u2013 Dabhol (Chandika Mandir). Once you are at Dabhol, you may join the Ferry Service.",
      "Another alternative is to join \u2018Rohini \u2013 Agardanda\u2019 Ferry once you reach Harihareshwar. Then Shrivardhan and Divegar. From \u2018Rohini Ferry\u2019 you may visit Murud \u2013 Janjeera, Nandgaon, Kashid beach, Alibaug, Rewas and some other places. You can continue your journey via NH-17 also either from Shrivardhan, Mhasala or Mangaon.",
    ],
    tourist:
      "Must-visit destinations include Velas Beach (Kasav Mahotsav / Turtle Festival), Harihareshwar, Dive-Aagar, Borli, Kelshi Mahalaxmi Temple, Anjarle Beach, Harnai Beach, Suvarnadurga Fort, Ladghar Beach, Burondi (Lord Parshuram Statue), Kolthare Beach, Kolishwar Temple, and Dabhol Chandika Mandir.",
    contacts: [
      { label: "Veshvi Office", phones: ["02350-223300"] },
      { label: "Bagmandale", phones: ["9322819161"] },
    ],
    timetableImage: "/images/timetables/veshvi-bagmandale.jpg",
    ratecardImage: "/images/ratecards/veshvi.jpg",
  },
  "vasai-bhayander": {
    name: "Vasai \u2013 Bhayander",
    subtitle: "Suvarnadurga Shipping & Marine Ser.Pvt Ltd recently got the opportunity to Serve People in Vasai, Bhayander.",
    image: "/images/routes/vasai-bhayander.jpg",
    about: [
      "Suvarnadurga Shipping & Marine Ser.Pvt Ltd recently got the opportunity to Serve People in Vasai Bhaindar. This is the seventh route by SSMS. Maharashtra Maritime Board permitted this RORO service under the SAGARMALA PROJECT Of the central Government. Though its Provisional, Suvarnadurga Shipping & Marine Services will surely make it Permanent as Suvarnadurga has 21 Years of Experience for RoRo service at different creeks covering All over Maharashtra almost. For now, as many studies of Tides Jetty levels etc are going on Vasai Bhaindar RoRo service has some limitations of Timing so we are with the Latest Time Table which is subject to change depending on Tide levels.",
      "Vasai is well known for its historical importance as Vasai killa which is a bit neglected but with great historical impact. It can develop tourist destinations in the future due to RoRo services. Vasai is also known as Maharashtra\u2019s GOA as It has Portuguese culture. We can bloom this village as a Tourist destination with a Goan impact. Vasai is well known for its fruits by RoRo service this Trading can also progress in the future.",
      "Bhayander is a marketplace for all and well connected with all routes. Bhayander with rapidly growing market can provide all the favorable features with RoRo services. Tourism will surely increase with RoRo so SSMS is introducing Different TIME Table for Saturday & Sunday. All time Tables are available on our website.",
    ],
    tourist:
      "Vasai Fort (Vasai Killa) with its Portuguese cultural heritage, nearby beaches, and historical sites. Bhayander is a growing marketplace well connected with all routes.",
    contacts: [
      { label: "Vasai Office", phones: ["8624063900"] },
      { label: "Bhayander Office", phones: ["8600314710"] },
    ],
    timetableImage: "/images/timetables/vasai-bhayander.jpg",
    ratecardImage: "/images/ratecards/vasai.png",
  },
  "ambet-mahpral": {
    name: "Ambet \u2013 Mahpral",
    subtitle: "Free Ferry Service \u2014 Currently Closed",
    status: "closed" as const,
    image: "/images/routes/ambet-mahpral.jpg",
    about: [
      "This Ferry Service by Suvarnadurga Shipping & Marine Ser. is the new (5th) Ferry Route which is established as ALTERNATIVE for Ambet Bridge Which needs Repair, so it\u2019s a Ro-Ro Service which is a great relief for all the people traveling to Mumbai Pune, etc from Dapoli & Mandangad; as without this Ferry, one has to travel a long distance Via Mahad.",
      "Ambet \u2013 Mahpral Ferry not only saves Fuel but also saves Time & money as it gives you a Shorter path to travel which takes only 2 mins while traveling by Mahad will take More than 1hr. that is more than 40kms; so This Ferry Service is actually an essential service because in any emergency Medical or any other this will be the fastest route to approach the NH 17 or to travel to Mumbai from Dapoli & Mandangad.",
      "Repair & Maintenance of Ambet bridge was started from 08.02.21 to 27.06.2021 & to serve the common people we Suvarnadurga & Shipping & marine Serv. Pvt. Ltd started & conducted ferry service for 5 months successfully.",
      "This service has started from 12.04.2022 due to repair & maintenance of Ambet bridge. This time, PWD MAHAD UNDER GOVERNMENT OF MAHARASHTRA has allowed us to offer this service TOTALLY FREE FOR ALL. This service will start from 6.00 AM in the morning to 12.00 PM on regular basis. (CURRENTLY CLOSED)",
    ],
    tourist:
      "The route serves local communities traveling between Ambet and Mahpral, providing a vital short crossing that eliminates a lengthy 40+ km road detour via Mahad.",
    contacts: [
      { label: "Mahpral", phones: ["8624063900"] },
      { label: "Ambet", phones: ["7709250800"] },
    ],
    timetableImage: "/images/timetables/ambet-mahpral.jpg",
  },
  "virar-saphale": {
    name: "Virar \u2013 Saphale (Jalsar)",
    subtitle: "From 1 Hr 20 Mins to Just 15 Mins! A New Landmark in Connectivity",
    image: null,
    about: [
      "Suvarnadurga Shipping & Marine Services Pvt. Ltd., with an impeccable 21-year legacy of safe and efficient maritime service, proudly introduces its newest milestone \u2013 a game-changing RORO service between Virar and Saphale (Jalsar). Imagine cutting your commute from 1 hour 20 minutes down to just 15 minutes. Not only are you saving time, but you\u2019re also significantly reducing fuel expenses\u2014no more long drives, traffic stress, or unnecessary fuel consumption.",
      "This waterway isn\u2019t just a shortcut\u2014it\u2019s a smarter, greener, and more scenic route, aligning with government sustainability guidelines and promoting eco-friendly transport for a better tomorrow.",
      "Once you dock at Jalsar (Saphale side), you gain access to some of Maharashtra\u2019s most historic and scenic destinations, ideal for one-day escapes, nature treks, and cultural exploration. Tandulwadi Fort (15 KM from Jalsar) \u2013 an 800-year-old hill fort perched at 1,524 feet, offering breathtaking views of the Arabian Sea. Bhavangad Fort (11 KM) \u2013 Built in 1737 by Chimaji Appa, this coastal fort stands as a testament to Maratha bravery.",
      "Other nearby attractions include Dativare Fort (also known as Hira Dongar), Shede Dev Temple (a century-old shrine dedicated to Lord Shiva, a spiritual hub during Maha Shivaratri), and Makunsar Village (home to Shri Datta Mandir and Chamunda Devi Mandir). Skip the traffic. Embrace the river. Let Suvarnadurga RORO be your gateway to a refreshing, responsible, and rewarding journey.",
    ],
    tourist:
      "Nearby attractions include Tandulwadi Fort (15 km, 800 years old, 1524 ft elevation), Bhavangad Fort (11 km, built in 1737 by Chimaji Appa), Dativare Fort (Hira Dongar), Shede Dev Temple (a major Maha Shivaratri hub), and Makunsar Village (Shri Datta Mandir and Chamunda Devi Mandir).",
    contacts: [
      { label: "Virar Office", phones: ["9371002900"] },
      { label: "Saphale Office", phones: ["8459803521"] },
    ],
    timetableImage: "/images/timetables/virar-saphale.png",
    ratecardImage: "/images/ratecards/virar.png",
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
          {route.status === "closed" && (
            <span className="inline-block mt-3 bg-red-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full">
              Currently Closed
            </span>
          )}
          {route.status === "open" && route.name.includes("Free") ? null : null}

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

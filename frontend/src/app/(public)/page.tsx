"use client";

import Image from "next/image";
import Link from "next/link";

const ROUTES = [
  {
    name: "Dabhol – Dhopave",
    slug: "dabhol-dhopave",
    image: "/images/routes/dabhol-dhopave.jpg",
    description:
      "The very first site which was started on 21.10.2003 & constantly working at all times and in all seasons since its first day.",
  },
  {
    name: "Jaigad – Tawsal",
    slug: "jaigad-tawsal",
    image: "/images/routes/jaigad-tawsal.jpg",
    description:
      "This Ferry service was started for the easy & better transportation from Guhaghar to Ratnagiri region.",
  },
  {
    name: "Dighi – Agardande",
    slug: "dighi-agardande",
    image: "/images/routes/dighi-agardande.jpg",
    description:
      "Connecting to National Highway 17, this route provides easy access to destinations like Murud-Janjeera, Kashid beach, and Alibaug.",
  },
  {
    name: "Veshvi – Bagmandale",
    slug: "veshvi-bagmandale",
    image: "/images/routes/veshvi-bagmandale.jpg",
    description:
      "Operating since 2007, this ferry made the journey from Raigad to Ratnagiri very easy and quick.",
  },
  {
    name: "Vasai – Bhayander",
    slug: "vasai-bhayander",
    image: "/images/routes/vasai-bhayander.jpg",
    description:
      "Our newest RORO service operating under the Sagarmala Project, connecting Vasai and Bhayander.",
  },
  {
    name: "Ambet – Mahpral",
    slug: "ambet-mahpral",
    image: "/images/routes/ambet-mahpral.jpg",
    description:
      "Connecting coastal communities with reliable ferry services for passengers and vehicles.",
  },
];

const SERVICES = [
  {
    title: "Passenger Ferry Services",
    image: "/images/backgrounds/cruise-services.jpg",
    description:
      "Safe and comfortable ferry rides for passengers across all our routes. Travel with ease and enjoy the scenic Konkan coastline.",
  },
  {
    title: "Vehicle Transportation",
    image: "/images/backgrounds/inland-services.jpg",
    description:
      "Transport your cars, bikes, and commercial vehicles safely. Our RORO ferries can accommodate all types of vehicles.",
  },
];

const WHY_CHOOSE_US = [
  {
    title: "Safe & Reliable",
    description: "All our ferries meet strict safety standards with trained crew members.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: "On-Time Service",
    description: "Reliable schedules you can count on, running 7 days a week.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Vehicle Transport",
    description: "RORO ferries accommodate cars, bikes, and commercial vehicles.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h8m-8 4h4m-2 4v4m-4-4h8a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Comfortable Journey",
    description: "Spacious seating and scenic views of the Konkan coast.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    title: "6 Major Routes",
    description: "Extensive network connecting key destinations across Maharashtra.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    title: "Since 2003",
    description: "Over 20 years of trusted service to the coastal communities.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-[#0c3547] overflow-hidden">
        {/* Background Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/50" />

        <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
            <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v-2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
            </svg>
            <span className="text-white/90 text-sm font-medium">
              Maharashtra&apos;s Premier Ferry Service
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight">
            Ready to Begin Your{" "}
            <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
              Journey
            </span>
            ?
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8 leading-relaxed">
            Experience seamless ferry travel across Maharashtra&apos;s beautiful
            Konkan coast. Safe, reliable, and scenic journeys since 2003.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/customer/login"
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-8 py-3 rounded-lg text-base font-semibold transition-all shadow-lg hover:shadow-xl hover:scale-105"
            >
              Book Your Ferry
            </Link>
            <Link
              href="#routes"
              className="border-2 border-white/30 hover:border-white/60 text-white px-8 py-3 rounded-lg text-base font-semibold transition-all hover:bg-white/10"
            >
              View Routes
            </Link>
          </div>
          <p className="text-gray-400 text-sm mt-12 animate-bounce">
            Scroll to explore
          </p>
        </div>
      </section>

      {/* Ferry Routes Section */}
      <section id="routes" className="py-16 md:py-20 bg-gradient-to-b from-white to-sky-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block text-sky-600 bg-sky-50 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full mb-3">
              Our Routes
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Ferry Services Across Konkan
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Connecting Maharashtra&apos;s beautiful coastal communities with
              reliable ferry services since 2003.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ROUTES.map((route) => (
              <div
                key={route.name}
                className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100"
              >
                <div className="relative h-48 overflow-hidden">
                  <Image
                    src={route.image}
                    alt={route.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-3 left-3">
                    <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                      {route.name}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    {route.name}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed mb-3">
                    {route.description}
                  </p>
                  <Link
                    href={`/route/${route.slug}`}
                    className="text-sky-600 text-sm font-semibold hover:text-sky-800 transition-colors"
                  >
                    Know More &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comprehensive Ferry Services */}
      <section className="py-16 md:py-20 bg-sky-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block text-amber-700 bg-amber-50 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full border border-amber-200 mb-3">
              What We Offer
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Comprehensive Ferry Services
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              From passenger transport to vehicle shipping, we&apos;ve got all
              your ferry needs covered.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {SERVICES.map((service) => (
              <div
                key={service.title}
                className="group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300"
              >
                <div className="relative h-64 sm:h-80">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <h3 className="text-xl font-bold mb-2">{service.title}</h3>
                  <p className="text-gray-200 text-sm leading-relaxed">
                    {service.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block text-sky-600 bg-sky-50 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full mb-3">
              Why Choose Us
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              The Trusted Choice for Ferry Travel
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHY_CHOOSE_US.map((item) => (
              <div
                key={item.title}
                className="text-center p-6 rounded-xl border border-gray-100 hover:border-amber-300 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 text-amber-500 mb-4 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  {item.icon}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          {/* Stats bar */}
          <div className="mt-16 bg-gradient-to-r from-[#0c3547] to-[#1a6b8a] rounded-2xl p-4 sm:p-8 text-center">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { value: "20+", label: "Years of Service" },
                { value: "6", label: "Active Routes" },
                { value: "65+", label: "Employees" },
                { value: "1M+", label: "Passengers Served" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl md:text-4xl font-bold text-amber-400">
                    {stat.value}
                  </div>
                  <div className="text-gray-300 text-sm mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* About Section - Dark Navy Gradient Background */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#1a5c7a] via-[#0f3a50] to-[#0a2030]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <span className="inline-block text-cyan-300 bg-white/10 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full mb-3">
              About Us
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              About Suvarnadurga Shipping
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Image */}
            <div className="relative">
              <div className="relative w-full h-80 md:h-96 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/10">
                <Image
                  src="/images/misc/team-photo.jpg"
                  alt="Our Leadership"
                  fill
                  className="object-cover"
                />
              </div>
              {/* Floating stat badge */}
              <div className="absolute -bottom-4 -right-4 md:bottom-4 md:right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 rounded-xl shadow-lg">
                <div className="text-2xl font-bold">20+</div>
                <div className="text-xs">Years of Service</div>
              </div>
            </div>

            {/* Content */}
            <div>
              <p className="text-gray-300 leading-relaxed mb-4">
                Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd. was
                established in October 2003 by Dr. Mokal C.J. (former MLA of
                Dapoli-Mandangad), with Dr. Mokal Y.C. serving as Managing
                Director.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                Our first venture was the Dabhol-Dhopave ferry service - the
                first Ferry Boat Service in Maharashtra. Since then, we have
                expanded to operate 6 routes across the Konkan coast, serving
                thousands of passengers daily.
              </p>
              <p className="text-gray-300 leading-relaxed mb-6">
                With approximately 65 employees and a commitment to safety and
                reliability, we continue to connect coastal communities and
                boost tourism in the region.
              </p>

              <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-white">65+ Employees</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-white">6 Active Routes</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-white">1000s of Daily Passengers</span>
                </div>
              </div>

              <Link
                href="/about"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                Learn More About Us
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

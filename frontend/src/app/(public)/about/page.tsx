"use client";

import Image from "next/image";
import Link from "next/link";

const ferryRoutes = [
  "Dabhol \u2013 Dhopave",
  "Jaigad \u2013 Tawsal",
  "Dighi \u2013 Agardande",
  "Veshvi \u2013 Bagmandale",
  "Vasai \u2013 Bhayander",
  "Virar \u2013 Saphale (Jalsar)",
  "Ambet \u2013 Mahpral",
];

const stats = [
  { value: "20+", label: "YEARS OF SERVICE" },
  { value: "7", label: "FERRY ROUTES" },
  { value: "65+", label: "EMPLOYEES" },
  { value: "1M+", label: "PASSENGERS SERVED" },
];

const commitments = [
  {
    title: "Safety First",
    description:
      "All our vessels are equipped with life-saving equipment and undergo annual inspections. Your safety is our priority.",
    icon: (
      <svg
        className="w-8 h-8 text-amber-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
  {
    title: "Government Approved",
    description:
      "All ticket rates and permits are approved by the Maharashtra Maritime Board. We pay approximately \u20B94,00,000 annually in levies per ferry boat.",
    icon: (
      <svg
        className="w-8 h-8 text-amber-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
        />
      </svg>
    ),
  },
  {
    title: "Reliable Service",
    description:
      "Operating 7 days a week, in all seasons. Our ferries have been running continuously since 2003 with minimal disruptions.",
    icon: (
      <svg
        className="w-8 h-8 text-amber-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
];

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* ===== 1. Blue Banner Section ===== */}
      <section
        className="relative py-16 md:py-20"
        style={{
          background: "linear-gradient(135deg, #0c3547 0%, #1a6b8a 100%)",
        }}
      >
        {/* Subtle wave pattern overlay */}
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
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            About Us
          </h1>
          <p className="text-lg md:text-xl text-cyan-100 mb-6">
            Maharashtra&apos;s First Ferry Boat Service Since 2003
          </p>
          <nav className="flex items-center justify-center gap-2 text-sm">
            <Link
              href="/"
              className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
            >
              Home
            </Link>
            <span className="text-cyan-200">&gt;</span>
            <span className="text-white">About Us</span>
          </nav>
        </div>
      </section>

      {/* ===== 2. Company Description Section ===== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold text-sky-600 bg-sky-50 mb-4">
            Who We Are
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
          </h2>
          <p className="text-gray-600 leading-relaxed text-base md:text-lg">
            We are a transportation company focused on ferry services across
            Maharashtra&apos;s coastal regions. Our organization emphasizes fuel
            efficiency and serves both the public and tourism sectors. Since our
            inception in 2003, we have been committed to providing safe,
            reliable, and affordable ferry services to connect the beautiful
            Konkan coast.
          </p>
        </div>
      </section>

      {/* ===== 3. Our Story Section ===== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Image */}
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-xl">
                <Image
                  src="/images/misc/team-photo.jpg"
                  alt="Our Leadership Team"
                  width={640}
                  height={440}
                  className="w-full h-auto object-cover"
                  priority
                />
              </div>
              {/* Decorative accent behind image */}
              <div className="absolute -bottom-4 -right-4 w-full h-full rounded-2xl border-2 border-amber-400/30 -z-10" />
            </div>

            {/* Right: Story content */}
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold text-amber-600 bg-amber-50 mb-3">
                Our Journey
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
                Our Story
              </h3>
              <div className="w-16 h-1 bg-amber-500 rounded-full mb-6" />

              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  The company was established in October 2003 by Dr. Mokal C.J.
                  (former MLA of Dapoli-Mandangad), with Dr. Mokal Y.C. serving
                  as Managing Director.
                </p>
                <p>
                  Our first venture was the Dabhol-Dhopave ferry service,
                  described as &quot;a first Ferry Boat Service in
                  Maharashtra,&quot; eliminating the need for expensive highway
                  travel. This pioneering service opened up new possibilities for
                  coastal transportation and tourism.
                </p>
                <p>
                  Since then, we have expanded to operate seven ferry routes
                  across the Konkan coast, connecting communities, supporting
                  local businesses, and promoting tourism in the region. Our
                  ferries serve thousands of passengers daily, providing a vital
                  link between coastal towns.
                </p>
                <p>
                  With approximately 65 employees across different locations, we
                  continue to grow while maintaining our commitment to safety,
                  reliability, and customer service.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 4. Stats Counter Section ===== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="text-center p-6 rounded-xl bg-gray-50 border border-gray-100"
              >
                <div className="text-4xl md:text-5xl font-bold text-amber-500 mb-2">
                  {stat.value}
                </div>
                <div className="text-xs md:text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 5. Ferry Routes We Operate ===== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <span className="block text-center mb-3">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold text-sky-600 bg-sky-50">
              Our Routes
            </span>
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center mb-10">
            Ferry Routes We Operate
          </h2>
          <div className="flex flex-wrap justify-center gap-3 md:gap-4">
            {ferryRoutes.map((route) => (
              <div
                key={route}
                className="flex items-center gap-2 bg-amber-100 border border-amber-400 text-amber-700 px-5 py-3 rounded-full text-sm md:text-base font-medium shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Boat icon */}
                <svg
                  className="w-4 h-4 text-amber-500 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v-2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
                </svg>
                {route}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 6. Our Commitment Section ===== */}
      <section
        className="py-16 md:py-20"
        style={{
          background: "linear-gradient(180deg, #1a5c7a 0%, #0c3547 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold text-amber-600 bg-amber-50 mb-4">
              Our Values
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Our Commitment
            </h2>
            <p className="text-cyan-100 text-base md:text-lg">
              Safety, compliance, and customer satisfaction are our top
              priorities
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {commitments.map((item) => (
              <div
                key={item.title}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 hover:bg-white/15 transition-colors border border-white/10 text-center"
              >
                <div className="w-16 h-16 mx-auto mb-5 bg-amber-500/20 rounded-full flex items-center justify-center">
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-3">
                  {item.title}
                </h3>
                <p className="text-cyan-100 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 7. Contact Info Bar ===== */}
      <section className="bg-gradient-to-r from-amber-500 to-orange-600">
        <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Head Office */}
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h4 className="font-bold text-white mb-2 text-sm uppercase tracking-wider">
              Head Office
            </h4>
            <p className="text-white/90 text-sm">
              Dabhol FerryBoat Jetty, Dapoli
            </p>
            <p className="text-white/90 text-sm">
              Dist. Ratnagiri, Maharashtra - 415712
            </p>
          </div>

          {/* Contact Numbers */}
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <h4 className="font-bold text-white mb-2 text-sm uppercase tracking-wider">
              Contact Numbers
            </h4>
            <p className="text-white/90 text-sm">
              <a
                href="tel:02348248900"
                className="hover:text-white transition-colors"
              >
                02348-248900
              </a>
            </p>
            <p className="text-white/90 text-sm">
              <a
                href="tel:+919767248900"
                className="hover:text-white transition-colors"
              >
                +91 9767248900
              </a>
            </p>
          </div>

          {/* Email Us */}
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h4 className="font-bold text-white mb-2 text-sm uppercase tracking-wider">
              Email Us
            </h4>
            <p className="text-white/90 text-sm">
              <a
                href="mailto:ssmsdapoli@rediffmail.com"
                className="hover:text-white transition-colors"
              >
                ssmsdapoli@rediffmail.com
              </a>
            </p>
            <p className="text-white/90 text-sm">
              <a
                href="mailto:y.mokal@rediffmail.com"
                className="hover:text-white transition-colors"
              >
                y.mokal@rediffmail.com
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

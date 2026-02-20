"use client";

import { useState, useMemo, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const ROUTES = [
  {
    name: "Dabhol \u2013 Dhopave",
    phones: ["02348-248900", "9767248900"],
  },
  {
    name: "Jaigad \u2013 Tawsal",
    phones: ["02354-242500", "8550999884"],
  },
  {
    name: "Dighi \u2013 Agardande",
    phones: ["9156546700", "8550999887"],
  },
  {
    name: "Veshvi \u2013 Bagmandale",
    phones: ["02350-223300", "9322819161"],
  },
  {
    name: "Vasai \u2013 Bhayander",
    phones: ["8624063900", "8600314710"],
  },
];

/* ------------------------------------------------------------------ */
/*  SVG Icon Components                                                */
/* ------------------------------------------------------------------ */

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="24"
      height="24"
    >
      <path
        fillRule="evenodd"
        d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="24"
      height="24"
    >
      <path
        fillRule="evenodd"
        d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="24"
      height="24"
    >
      <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
      <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
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
      width="24"
      height="24"
    >
      <path
        fillRule="evenodd"
        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function BoatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="24"
      height="24"
    >
      <path d="M2 20a2 2 0 002 2h16a2 2 0 002-2" />
      <path d="M4 18l-1.5 2" />
      <path d="M20 18l1.5 2" />
      <path d="M12 2v4" />
      <path d="M2 18h20L18 6H6L2 18z" />
      <path d="M9 14h6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact Page                                                       */
/* ------------------------------------------------------------------ */

export default function ContactPage() {
  /* --- form state --- */
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [captchaInput, setCaptchaInput] = useState("");

  /* generate a simple math captcha (two single-digit numbers) */
  const captcha = useMemo(() => {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { a, b, answer: a + b };
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (parseInt(captchaInput, 10) !== captcha.answer) {
      alert("Incorrect captcha answer. Please try again.");
      return;
    }

    alert(
      "Thank you for contacting us! We will get back to you shortly.",
    );
    setFormData({ name: "", email: "", phone: "", message: "" });
    setCaptchaInput("");
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <>
      {/* ============================================================ */}
      {/* 1. Blue Banner                                                */}
      {/* ============================================================ */}
      <section
        className="w-full py-16 md:py-20"
        style={{
          background:
            "linear-gradient(135deg, #0a2a38 0%, #1a6b8a 50%, #0c3547 100%)",
        }}
      >
        <div className="mx-auto max-w-5xl px-4 text-center text-white">
          <h1 className="text-4xl font-bold md:text-5xl">Contact Us</h1>
          <p className="mt-3 text-lg text-white/80 md:text-xl">
            We value your opinion. Please give your feedback.
          </p>

          {/* breadcrumb */}
          <nav className="mt-6 flex items-center justify-center gap-2 text-sm text-white/70">
            <Link
              href="/"
              className="font-medium text-amber-500 hover:underline"
            >
              Home
            </Link>
            <span>&gt;</span>
            <span className="text-white">Contact Us</span>
          </nav>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. Get In Touch                                               */}
      {/* ============================================================ */}
      <section className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          {/* heading */}
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full bg-sky-100 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-sky-700">
              Contact
            </span>
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">
              Get In Touch
            </h2>
            <div className="mx-auto mt-3 h-1 w-16 rounded bg-amber-500" />
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">
              Have questions about our ferry services? Need help with a booking?
              We&apos;re here to help. Fill out the form below or contact us
              directly.
            </p>
          </div>

          {/* two-column */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* LEFT: Contact Form */}
            <div className="rounded-xl bg-white p-6 shadow-lg ring-1 ring-gray-100 md:p-8">
              <h3 className="mb-6 text-xl font-semibold text-slate-900">
                Send Us a Message
              </h3>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter your name"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#0891b2] focus:ring-2 focus:ring-[#0891b2]/20"
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email address"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#0891b2] focus:ring-2 focus:ring-[#0891b2]/20"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#0891b2] focus:ring-2 focus:ring-[#0891b2]/20"
                  />
                </div>

                {/* Message */}
                <div>
                  <label
                    htmlFor="message"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Your Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={4}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Write your message here..."
                    className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#0891b2] focus:ring-2 focus:ring-[#0891b2]/20"
                  />
                </div>

                {/* Captcha */}
                <div>
                  <label
                    htmlFor="captcha"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    What is{" "}
                    <span className="font-bold text-slate-900">
                      {captcha.a} + {captcha.b}
                    </span>{" "}
                    = ?{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="captcha"
                    required
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    placeholder="Enter the answer"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#0891b2] focus:ring-2 focus:ring-[#0891b2]/20"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/30 transition hover:from-amber-600 hover:to-orange-600 hover:shadow-xl hover:shadow-amber-500/40"
                >
                  Send Message
                </button>
              </form>
            </div>

            {/* RIGHT: Contact Info Cards */}
            <div className="flex flex-col gap-5">
              {/* Head Office Address */}
              <ContactInfoCard
                icon={<LocationIcon className="h-6 w-6 text-orange-600" />}
                iconBg="bg-orange-100"
                title="Head Office Address"
              >
                <p>Dabhol FerryBoat Jetty,</p>
                <p>Dapoli, Dist. Ratnagiri,</p>
                <p>Maharashtra - 415712</p>
              </ContactInfoCard>

              {/* Phone Numbers */}
              <ContactInfoCard
                icon={<PhoneIcon className="h-6 w-6 text-blue-600" />}
                iconBg="bg-blue-100"
                title="Phone Numbers"
              >
                <p>Dabhol: 02348-248900, 9767248900</p>
                <p>Veshvi: 02350-223300, 8767980300</p>
              </ContactInfoCard>

              {/* Email Addresses */}
              <ContactInfoCard
                icon={<MailIcon className="h-6 w-6 text-emerald-600" />}
                iconBg="bg-emerald-100"
                title="Email Addresses"
              >
                <p>ssmsdapoli@rediffmail.com</p>
                <p>y.mokal@rediffmail.com</p>
              </ContactInfoCard>

              {/* Operating Hours */}
              <ContactInfoCard
                icon={<ClockIcon className="h-6 w-6 text-purple-600" />}
                iconBg="bg-purple-100"
                title="Operating Hours"
              >
                <p>Monday - Sunday: 9:00 AM - 5:00 PM</p>
                <p>Open all 7 days of the week</p>
              </ContactInfoCard>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. Route-wise Contact Numbers                                 */}
      {/* ============================================================ */}
      <section className="bg-gray-50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full bg-amber-100 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
              Routes
            </span>
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">
              Route-wise Contact Numbers
            </h2>
            <div className="mx-auto mt-3 h-1 w-16 rounded bg-amber-500" />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ROUTES.map((route) => (
              <div
                key={route.name}
                className="rounded-xl border-t-4 border-amber-500 bg-white p-6 shadow-md ring-1 ring-gray-100 transition hover:shadow-lg"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                    <BoatIcon className="h-5 w-5 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-amber-700">
                    {route.name}
                  </h3>
                </div>
                <div className="space-y-1 pl-[52px] text-sm text-gray-600">
                  {route.phones.map((phone) => (
                    <p key={phone} className="flex items-center gap-2">
                      <PhoneIcon className="h-4 w-4 text-sky-500" />
                      <span>{phone}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. Our Location (Map)                                         */}
      {/* ============================================================ */}
      <section className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full bg-sky-100 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-sky-700">
              Map
            </span>
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">
              Our Location
            </h2>
            <div className="mx-auto mt-3 h-1 w-16 rounded bg-amber-500" />
          </div>

          <div className="overflow-hidden rounded-xl shadow-lg">
            <Image
              src="/images/misc/map.jpg"
              alt="Ferry Service Locations Map"
              width={1200}
              height={600}
              className="h-auto w-full object-cover"
              priority={false}
            />
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable Contact Info Card                                         */
/* ------------------------------------------------------------------ */

function ContactInfoCard({
  icon,
  iconBg,
  title,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
      >
        {icon}
      </div>
      <div>
        <h3 className="mb-1 font-semibold text-slate-900">{title}</h3>
        <div className="text-sm leading-relaxed text-gray-600">{children}</div>
      </div>
    </div>
  );
}

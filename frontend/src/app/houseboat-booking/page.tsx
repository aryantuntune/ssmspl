"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

const HERO_IMAGES = [
  "/images/houseboat/hero_banner_1.jpg",
  "/images/houseboat/hero_banner_2.jpg",
  "/images/houseboat/hero_banner_3.jpg",
];

const ROOMS = [
  {
    id: "deluxe",
    name: "Deluxe Room",
    image: "/images/houseboat/deluxe_room_main.jpg",
    availableBadge: "AVAILABLE TODAY",
    scarcityBadge: "Only 3 Rooms Left!",
    tags: ["King Bed", "AC", "Sea View", "Attached Bathroom"],
    description:
      "AP (Room with Breakfast, Lunch, High Tea, Dinner). Experience the luxury of staying on the tranquil waters with all modern amenities.",
    price: 6000,
  },
  {
    id: "vip",
    name: "VIP Suite with Deck",
    image: "/images/houseboat/vip_suite_main.jpg",
    availableBadge: "AVAILABLE TODAY",
    scarcityBadge: "Only 2 Rooms Left!",
    tags: ["King Bed", "Private Deck", "AC", "Bathtub", "Sea View"],
    description:
      "Luxury redefined. Enjoy your morning coffee on your private deck with panoramic views of the sea. Includes all meals.",
    price: 8000,
  },
];

const FEATURES = [
  {
    title: "Complimentary Authentic Breakfast",
    description:
      "Start your mornings with freshly prepared local delicacies and continental options.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: "Panoramic Deck Views",
    description:
      "Unwind on the open deck with breathtaking 360-degree views of the backwaters.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: "24/7 On-board Assistance",
    description:
      "Our dedicated crew is available round the clock to make your stay comfortable.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
  },
];

export default function HouseboatBookingPage() {
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [occupancy, setOccupancy] = useState("1 Room, 2 Guests");

  // Auto-rotate hero images every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ====== HERO SECTION ====== */}
      <section className="relative h-[90vh] min-h-[600px] overflow-hidden">
        {/* Hero Images */}
        {HERO_IMAGES.map((src, index) => (
          <div
            key={src}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: index === currentHeroIndex ? 1 : 0 }}
          >
            <Image
              src={src}
              alt={`Supriya Houseboat view ${index + 1}`}
              fill
              unoptimized
              className="object-cover"
              priority={index === 0}
            />
          </div>
        ))}

        {/* Dark overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />

        {/* Navigation */}
        <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
          <Link href="/houseboat-booking" className="flex items-center gap-2">
            <svg
              className="w-8 h-8 text-teal-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v-2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
            </svg>
            <span className="text-white text-lg font-bold tracking-wide uppercase">
              Supriya Houseboat
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-white/90 hover:text-white text-sm font-medium tracking-wide transition-colors"
            >
              HOME
            </Link>
            <a
              href="#rooms"
              className="text-white/90 hover:text-white text-sm font-medium tracking-wide transition-colors"
            >
              ROOMS
            </a>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full -mt-20 px-4 text-center">
          {/* Location Badge */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-1.5 rounded-full mb-5">
            <svg
              className="w-4 h-4 text-teal-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span className="text-white/90 text-sm font-medium">
              Dapoli, Maharashtra
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 tracking-tight">
            Supriya Houseboat
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl leading-relaxed mb-6">
            Experience the serenity of backwaters with luxury and comfort in the
            heart of Dapoli.
          </p>

          {/* Rating Badge */}
          <div className="flex items-center gap-2 bg-amber-500/20 backdrop-blur-sm border border-amber-400/30 px-4 py-2 rounded-full">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4].map((star) => (
                <svg
                  key={star}
                  className="w-4 h-4 text-amber-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              {/* Half star approximation */}
              <svg
                className="w-4 h-4 text-amber-400/50"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <span className="text-amber-300 text-sm font-bold">4.6</span>
          </div>

          {/* Hero image indicators */}
          <div className="flex items-center gap-2 mt-8">
            {HERO_IMAGES.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentHeroIndex(index)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  index === currentHeroIndex
                    ? "bg-white w-8"
                    : "bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Show hero image ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ====== SEARCH / BOOKING BAR ====== */}
      <section className="relative z-20 -mt-12 px-4">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Check In */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Check In
              </label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Check Out */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Check Out
              </label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Guests / Occupancy */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Guests / Occupancy
              </label>
              <select
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option>1 Room, 1 Guest</option>
                <option>1 Room, 2 Guests</option>
                <option>1 Room, 3 Guests</option>
                <option>2 Rooms, 2 Guests</option>
                <option>2 Rooms, 4 Guests</option>
                <option>3 Rooms, 6 Guests</option>
              </select>
            </div>

            {/* Search Button */}
            <div>
              <button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Search
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ====== ROOM CARDS ====== */}
      <section id="rooms" className="py-16 md:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block text-teal-600 bg-teal-50 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full mb-3">
              Our Rooms
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Choose Your Stay
            </h2>
          </div>

          <div className="space-y-8">
            {ROOMS.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-gray-100"
              >
                <div className="flex flex-col md:flex-row">
                  {/* Room Image */}
                  <div className="relative md:w-[40%] h-64 md:h-auto min-h-[280px]">
                    <Image
                      src={room.image}
                      alt={room.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    {/* Availability Badge */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <span className="inline-flex items-center gap-1 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {room.availableBadge}
                      </span>
                      <span className="inline-flex items-center gap-1 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {room.scarcityBadge}
                      </span>
                    </div>
                  </div>

                  {/* Room Details */}
                  <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-3">
                        {room.name}
                      </h3>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {room.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1.5 rounded-full"
                          >
                            <svg
                              className="w-3.5 h-3.5 text-teal-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Description */}
                      <p className="text-gray-500 text-sm leading-relaxed mb-6">
                        {room.description}
                      </p>
                    </div>

                    {/* Price and Actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-gray-100">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-slate-900">
                            &#8377;{room.price.toLocaleString("en-IN")}
                          </span>
                          <span className="text-gray-400 text-sm font-medium">
                            / night
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Excludes GST
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="text-teal-600 hover:text-teal-800 text-sm font-semibold transition-colors underline underline-offset-2">
                          VIEW DETAILS
                        </button>
                        <button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-md hover:shadow-lg flex items-center gap-2">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                            />
                          </svg>
                          Add Room
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== A FLOATING PARADISE SECTION ====== */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Content */}
            <div>
              <span className="inline-block text-teal-600 bg-teal-50 text-xs font-bold tracking-wider uppercase px-4 py-1.5 rounded-full mb-4">
                Discover
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
                A Floating Paradise
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8">
                Immerse yourself in the tranquility of our premium houseboat.
                Designed to offer a perfect blend of modern luxury and
                traditional charm, we ensure your stay is nothing short of
                magical.
              </p>

              {/* Features */}
              <div className="space-y-6">
                {FEATURES.map((feature) => (
                  <div key={feature.title} className="flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                      {feature.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-1">
                        {feature.title}
                      </h4>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Image with rating card */}
            <div className="relative">
              <div className="relative w-full h-[400px] md:h-[500px] rounded-2xl overflow-hidden shadow-2xl">
                <Image
                  src="/images/houseboat/about_deck.jpg"
                  alt="Supriya Houseboat deck with panoramic views"
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>

              {/* Floating rating card */}
              <div className="absolute -bottom-6 -left-4 md:bottom-6 md:-left-6 bg-white rounded-xl shadow-xl p-5 border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-amber-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                      Rated
                    </p>
                    <p className="text-sm font-bold text-slate-900">
                      #1 in Dapoli
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="bg-slate-900 text-gray-300">
        {/* Main Footer Content */}
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Brand Column */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <svg
                  className="w-7 h-7 text-teal-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v-2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
                </svg>
                <div>
                  <span className="text-white text-lg font-bold tracking-wide">
                    Supriya
                  </span>
                  <span className="text-teal-400 text-xs font-semibold uppercase tracking-widest ml-1.5">
                    Houseboat
                  </span>
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Experience the finest hospitality on the waters of Dapoli. Book
                your stay with us today.
              </p>
            </div>

            {/* Contact Column */}
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                Contact
              </h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0"
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
                  <span className="text-gray-400">
                    Dapoli, Dist. Ratnagiri, Maharashtra 415712
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-teal-400 flex-shrink-0"
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
                  <a
                    href="tel:+919422431371"
                    className="text-gray-400 hover:text-teal-400 transition-colors"
                  >
                    +91 9422431371
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-teal-400 flex-shrink-0"
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
                  <a
                    href="mailto:booking@supriyahouseboat.com"
                    className="text-gray-400 hover:text-teal-400 transition-colors"
                  >
                    booking@supriyahouseboat.com
                  </a>
                </li>
              </ul>
            </div>

            {/* Facilities Column */}
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                Facilities
              </h4>
              <ul className="space-y-2.5 text-sm">
                {[
                  "Restaurant",
                  "Ferry Service",
                  "Free Parking",
                  "Room Service",
                ].map((facility) => (
                  <li key={facility} className="flex items-center gap-2">
                    <svg
                      className="w-3.5 h-3.5 text-teal-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-gray-400">{facility}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Payment Methods Column */}
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                Payment Methods
              </h4>
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-4 py-3">
                <svg
                  className="w-5 h-5 text-teal-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span className="text-gray-400 text-sm">
                  Secure Payment Gateway
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright Bar */}
        <div className="border-t border-slate-800">
          <div className="max-w-6xl mx-auto px-4 py-5">
            <p className="text-center text-gray-500 text-sm">
              &copy; 2026 Supriya Houseboat (Jetty Services).
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

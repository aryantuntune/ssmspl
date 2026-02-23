"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a2a38] via-[#1a6b8a] to-[#0c3547] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-bold text-amber-400 mb-4">500</h1>
        <h2 className="text-2xl font-bold text-white mb-3">
          Something Went Wrong
        </h2>
        <p className="text-cyan-100/70 mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-6 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg hover:shadow-xl cursor-pointer"
          >
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-white/20 text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-white/10 transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DatasetSelector } from "@/components/sidebar/DatasetSelector";
import * as api from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async (path: string, saveTo?: string) => {
    setLoading(true);
    setError(null);
    try {
      const info = await api.loadDataset(path, saveTo);
      sessionStorage.setItem("dataset_path", info.root_path);
      sessionStorage.removeItem("dataset_save_to");
      router.push("/labeler");
      // Keep loading=true since the component unmounts on navigation.
      // Resetting here would briefly flash the form before the page transition.
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to load dataset");
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-[15vh] relative overflow-hidden">
      {/* Background gradient accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[60%] h-[60%] rounded-full bg-[#D3D5FD]/[0.05] blur-[120px]" />
        <div className="absolute -bottom-[30%] -right-[15%] w-[50%] h-[50%] rounded-full bg-[#A8ABE0]/[0.04] blur-[100px]" />
        {/* Side peek illustration */}
        <img
          src="/robot_j_tree.png"
          alt=""
          aria-hidden="true"
          className="absolute left-0 bottom-0 h-full w-auto opacity-[0.33]"
          style={{
            maskImage: "linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 90%)",
            WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 90%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-6">
        {/* Header */}
        <div className="text-center mb-10">
          {/* Robot icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D3D5FD]/15 to-[#A8ABE0]/15 border border-[#D3D5FD]/15 mb-6">
            <svg className="w-8 h-8 text-[#D3D5FD]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M6.5 8h11a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z" />
              <circle cx="9" cy="12" r="1" fill="currentColor" />
              <circle cx="15" cy="12" r="1" fill="currentColor" />
              <path d="M9 16v4M15 16v4M5 20h4M15 20h4" />
            </svg>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[#D3D5FD] mb-3">
            LeRobot Labeler
          </h1>
        </div>

        {/* Card */}
        <div className="bg-[#0B0B0D]/90 backdrop-blur-xl border border-[#2a2d38] rounded-2xl p-8 shadow-2xl shadow-black/40">
          <div className="mb-5">
            <h2 className="text-sm font-medium text-[#D3D5FD] mb-1">
              Dataset Path
            </h2>
            <p className="text-xs text-[#929AAB]">
              Select a local directory containing a LeRobot v3.0 dataset
            </p>
          </div>

          <DatasetSelector onLoad={handleLoad} loading={loading} error={error} />
        </div>

      </div>
    </div>
  );
}

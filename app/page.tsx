import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <Image
        src="/logo.jpeg"
        alt="Vibgyor Arts logo"
        width={249}
        height={252}
        preload
        className="size-40 rounded-full object-cover sm:size-48"
      />
      <h1 className="text-4xl font-semibold tracking-tight">Coming Soon!</h1>
    </main>
  );
}

import Link from 'next/link';

export function Hero() {
  return (
    <section className="container py-24 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Decentralized Identity for{' '}
          <span className="bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
            Humans & AI
          </span>
        </h1>
        <p className="mb-8 text-lg text-gray-600 md:text-xl">
          Portable identity and trust layer built on Monad. Create verifiable credentials,
          attestations, and reputation for the Web3 era.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/identity" className="btn-primary">
            Get Started
          </Link>
          <Link href="/payment-check" className="btn-secondary">
            Check a Payment
          </Link>
          <Link href="/docs" className="btn-secondary">
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout/PublicHeader';

const team = [
  {
    name: 'Ami Heines',
    role: 'Co-Founder and CTO',
    photo: '/team/ami.png',
    linkedin: 'https://www.linkedin.com/in/ami-heines/',
    bio: 'Ami is both an art fan and a world expert on blockchain technology. He is the CTO of Eos-in-a-box and Lendmart LLC — two latest blockchain tech companies. Ami also wrote a book on stock option risk management and is an advisor for several Israeli technology companies. He holds a B.Sc. in Physics & Mathematics from Tel Aviv University.',
  },
  {
    name: 'Israeli Ran',
    role: 'Ph.D. Co-Founder and COO',
    photo: '/team/israeli.png',
    linkedin: 'https://www.linkedin.com/in/israeli-ran-phd-645b6b24/',
    bio: 'Israeli is a photography and art fan and has been involved in technology evaluation for NYU startup mentorship program (Endless Frontier Labs). In his previous life, Israeli was a neuroscientist with an interest in neuronal circuits, synaptic plasticity, learning and memory.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          About Verarta
        </h1>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            What we do
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            We use modern blockchain technology to help you register and establish provenance
            for your art.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            How do we register your art?
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            We combine a high-performance private blockchain with Face ID or biometrics already
            present in your smartphone. There is no need for complicated passwords. You can upload
            images or videos of your art and include audio descriptions of special features unique
            to your work. Your files are safe and cannot be tampered with.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Provenance
          </h2>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            You, the art creator or collector, can upload high-resolution detailed images of your
            art. We believe that the best use of blockchain technology is recording real-world
            valuable items. The blockchain can store any data — images, videos, and PDF documents.
            Already have an expert evaluation? Simply upload your certificate and store it forever
            as part of the files chained to that item.
          </p>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Record ownership transfers on the blockchain — an easy process that lets you document
            the transfer of ownership. Think of this as a democratized registry. You don&apos;t need a
            government department keeping records of collectible works of art; blockchain technology
            enables you and other artists or collectors to participate and replace the centralized
            old paradigm.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Our Team
          </h2>
          <div className="mt-6 space-y-8">
            {team.map((member) => (
              <div key={member.name} className="flex gap-5">
                <Image
                  src={member.photo}
                  alt={member.name}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {member.name}
                  </h3>
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    LinkedIn
                  </a>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {member.role}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {member.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

import { Head, Link, usePage } from '@inertiajs/react';
import BrandMark from '@/components/brand-mark';
import { login } from '@/routes';

export default function Welcome() {
    const { auth } = usePage().props;

    return (
        <>
            <Head title="Welcome" />
            <div className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center p-6">
                <main className="w-full max-w-md text-center">
                    <div className="flex flex-col items-center gap-4">
                        <BrandMark iconClassName="size-8" />
                        <h1 className="text-2xl font-semibold">
                            Bus Tracking and Fleet Management System
                        </h1>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Terminal-based bus tracking and fleet management
                            system for monitoring vehicles, dispatches, routes,
                            and estimated arrival times in one place.
                        </p>
                    </div>

                    <div className="mt-8">
                        {auth.user ? (
                            <Link
                                href="/admin/dashboard"
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-5 py-2 text-sm font-medium"
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <Link
                                href={login()}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-5 py-2 text-sm font-medium"
                            >
                                Log in
                            </Link>
                        )}
                    </div>

                    {!auth.user && (
                        <p className="text-muted-foreground mt-6 text-sm">
                            Accounts are created by your system administrator.
                        </p>
                    )}
                </main>
            </div>
        </>
    );
}

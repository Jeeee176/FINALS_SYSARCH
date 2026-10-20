import { Head, Link } from '@inertiajs/react';

const titles: Record<number, string> = {
    400: 'Bad Request',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    419: 'Page Expired',
    429: 'Too Many Requests',
    500: 'Server Error',
    503: 'Service Unavailable',
};

export default function ErrorPage({
    status,
    message,
}: {
    status: number;
    message?: string;
}) {
    const title = titles[status] ?? 'Error';

    return (
        <>
            <Head title={`${status} ${title}`} />
            <div className="flex min-h-screen flex-col items-center justify-center p-8">
                <div className="text-center">
                    <h1 className="text-6xl font-bold tracking-tight">
                        {status}
                    </h1>
                    <p className="mt-4 text-xl font-semibold">{title}</p>
                    <p className="text-muted-foreground mt-2 text-sm">
                        {message ??
                            "You don't have permission to view this page."}
                    </p>
                    <Link
                        href="/"
                        className="border-input-border bg-background hover:bg-secondary mt-6 inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors"
                    >
                        Go home
                    </Link>
                </div>
            </div>
        </>
    );
}

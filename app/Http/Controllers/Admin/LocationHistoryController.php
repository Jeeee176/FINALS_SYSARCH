<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;

class LocationHistoryController extends Controller
{
    /**
     * Location History is now part of the unified Reports & Analytics page.
     * The former URL is kept functional by redirecting to the GPS Location
     * History category of that report, preserving existing bookmarks.
     */
    public function index()
    {
        return redirect()->route('admin.reports', ['category' => 'gps']);
    }
}

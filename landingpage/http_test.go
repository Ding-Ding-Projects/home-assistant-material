package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBackupsProxyAllowed(t *testing.T) {
	cases := []struct {
		method  string
		path    string
		allowed bool
	}{
		{http.MethodPost, "/new/upload", true},
		{http.MethodGet, "/7fed74c8/info", true},
		{http.MethodPost, "/7fed74c8/restore/full/when_ready", true},
		{http.MethodPost, "/7fed74c8/check_password", true},
		{http.MethodGet, "/restore/pending", true},
		{http.MethodDelete, "/restore/pending", true},
		// Everything else in the backup API stays closed
		{http.MethodGet, "/info", false},
		{http.MethodGet, "/7fed74c8/download", false},
		{http.MethodDelete, "/7fed74c8", false},
		{http.MethodPost, "/7fed74c8/restore/full", false},
		{http.MethodPost, "/new/full", false},
		{http.MethodPost, "/restore/pending", false},
		{http.MethodGet, "/new/upload", false},
		{http.MethodGet, "/../info", false},
		{http.MethodGet, "/not.a.slug/info", false},
		{http.MethodGet, "/Slug_with-dash/info", true},
	}
	for _, c := range cases {
		if got := backupsProxyAllowed(c.method, c.path); got != c.allowed {
			t.Errorf("%s %s: got %v, want %v", c.method, c.path, got, c.allowed)
		}
	}
}

func TestBackupsRequestTrusted(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		headers map[string]string
		trusted bool
	}{
		{"read needs nothing", http.MethodGet, "/supervisor-api/backups/restore/pending", nil, true},
		{"queue from this page", http.MethodPost, "/supervisor-api/backups/ab/restore/full/when_ready",
			map[string]string{"X-Requested-With": "landing-page", "Content-Type": "application/json"}, true},
		{"queue without the header", http.MethodPost, "/supervisor-api/backups/ab/restore/full/when_ready",
			map[string]string{"Content-Type": "text/plain"}, false},
		{"queue as plain text", http.MethodPost, "/supervisor-api/backups/ab/restore/full/when_ready",
			map[string]string{"X-Requested-With": "landing-page", "Content-Type": "text/plain"}, false},
		{"queue from another site", http.MethodPost, "/supervisor-api/backups/ab/restore/full/when_ready",
			map[string]string{"X-Requested-With": "landing-page", "Content-Type": "application/json", "Origin": "http://evil.example"}, false},
		{"upload from this page", http.MethodPost, "/supervisor-api/backups/new/upload",
			map[string]string{"X-Requested-With": "landing-page", "Content-Type": "multipart/form-data; boundary=x", "Origin": "http://ha.local"}, true},
		{"upload without the header", http.MethodPost, "/supervisor-api/backups/new/upload",
			map[string]string{"Content-Type": "multipart/form-data; boundary=x"}, false},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, c.path, nil)
		r.Host = "ha.local"
		for k, v := range c.headers {
			r.Header.Set(k, v)
		}
		if got := backupsRequestTrusted(r); got != c.trusted {
			t.Errorf("%s: got %v, want %v", c.name, got, c.trusted)
		}
	}
}

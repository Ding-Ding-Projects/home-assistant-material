package main

import (
	"net/http"
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
		{http.MethodGet, "/NOT-A-SLUG/info", false},
	}
	for _, c := range cases {
		if got := backupsProxyAllowed(c.method, c.path); got != c.allowed {
			t.Errorf("%s %s: got %v, want %v", c.method, c.path, got, c.allowed)
		}
	}
}

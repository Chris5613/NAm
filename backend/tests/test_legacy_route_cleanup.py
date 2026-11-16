"""Retired HTTP routes cannot return silently; production routes remain available."""
import unittest

from backend.routers import market, project_tracking, resources, spending, yield_sources


class LegacyRouteCleanupTests(unittest.TestCase):
    def test_retired_paths_are_not_registered(self):
        routes = (
            market.router.routes + project_tracking.router.routes + resources.router.routes
        )
        paths = {route.path for route in routes}
        for path in (
            "/api/market/mlb/{path:path}",
            "/api/net-worth/reconciliation",
            "/api/net-worth/history",
            "/api/migration/status",
            "/api/migration/preview",
            "/api/migration/import",
            "/api/project-tracking/financial-core/parity-observation",
            "/api/project-tracking/financial-core/parity",
            "/api/project-tracking/portfolio",
            "/api/project-tracking/status",
        ):
            with self.subTest(path=path):
                self.assertNotIn(path, paths)

    def test_important_routes_and_integrations_remain(self):
        paths = {route.path for router in (
            project_tracking.router, yield_sources.router, spending.router
        ) for route in router.routes}
        for path in (
            "/api/project-tracking/financial-core/home-business",
            "/api/project-tracking/financial-core/evaluate",
            "/api/project-tracking/crypto-dashboard",
            "/api/project-tracking/cross-page-integrity",
            "/api/project-tracking/kryptex/earnings-audit",
            "/api/yield-sources/cutover-backups",
            "/api/yield-sources/lulo-parity",
            "/api/spending/accounts",
        ):
            with self.subTest(path=path):
                self.assertIn(path, paths)

    def test_mlb_provider_is_not_reachable_through_generic_proxy(self):
        self.assertNotIn("mlb", market._provider_config())


if __name__ == "__main__":
    unittest.main()

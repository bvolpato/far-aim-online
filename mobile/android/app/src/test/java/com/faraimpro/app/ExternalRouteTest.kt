package com.faraimpro.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ExternalRouteTest {
    @Test
    fun `maps website and app links to exact bundled content`() {
        assertEquals(
            "far_part/61?section=61.3",
            ExternalRoute.fromUrl("https://faraim.online/far/61#61.3")
        )
        assertEquals(
            "aim_chapter/4?section=4-5-6",
            ExternalRoute.fromUrl("faraimpro://aim/4#4-5-6")
        )
        assertEquals(
            "advisory_circulars/ac-120-100",
            ExternalRoute.fromUrl("https://faraim.online/advisory-circulars/ac-120-100")
        )
    }

    @Test
    fun `rejects unsupported hosts and malformed identifiers`() {
        assertNull(ExternalRoute.fromUrl("https://example.com/far/61"))
        assertNull(ExternalRoute.fromUrl("faraimpro://far/not-a-part"))
        assertNull(ExternalRoute.fromUrl("faraimpro://advisory-circulars/../privacy"))
    }
}

package com.faraimpro.app.ui.screens

import com.faraimpro.app.data.PCGTerm
import org.junit.Assert.assertEquals
import org.junit.Test

class GlossaryReferenceTest {
    private val terms = listOf(
        PCGTerm("MARKER BEACON", "A navigation aid."),
        PCGTerm("AIR TRAFFIC [ICAO]", "Aircraft operating in flight."),
        PCGTerm("PREFERRED IFR ROUTES", "Routes established between busy terminals.")
    )

    @Test
    fun resolvesVisibleAndLegacyReferenceTargets() {
        assertEquals("MARKER BEACON", resolveGlossaryReference(terms, "MARKER_BEACON")?.term)
        assertEquals("MARKER BEACON", resolveGlossaryReference(terms, "MARKER BEACON")?.term)
        assertEquals(
            "AIR TRAFFIC [ICAO]",
            resolveGlossaryReference(terms, "AIR_TRAFFIC", isIcaoTerm = true)?.term
        )
    }
}

package com.nginxlearn.api.mission;

import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.nginxlearn.api.identity.Learner;

@RestController
@RequestMapping("/api/v1/missions")
public class MissionAttemptController {

    private static final Logger LOG = LoggerFactory.getLogger(MissionAttemptController.class);
    private static final Pattern MISSION_ID = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");

    private final MissionAttemptService attempts;
    private final MeterRegistry meters;

    public MissionAttemptController(MissionAttemptService attempts, MeterRegistry meters) {
        this.attempts = attempts;
        this.meters = meters;
    }

    @GetMapping("/attempts")
    public ResponseEntity<List<MissionAttemptService.AttemptView>> list(@AuthenticationPrincipal Learner learner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(attempts.list(learner.id()));
    }

    @PostMapping("/{missionId}/attempts")
    public ResponseEntity<MissionAttemptService.AttemptView> submit(@AuthenticationPrincipal Learner learner, @PathVariable String missionId,
                                                                    @Valid @RequestBody SubmitAttemptRequest request) {
        if (missionId.length() > 100 || !MISSION_ID.matcher(missionId).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID da missão inválido");
        }
        MissionAttemptService.SubmitResult result = attempts.submit(learner.id(), missionId, request.attemptId(),
                request.scenarioVersion(), request.config(), request.clientReport());
        if (result.created()) {
            LOG.info("Tentativa {} da missão {}: {}", result.attempt().attemptId(), missionId, result.attempt().status());
            meters.counter("nginxlearn.mission.attempts", "mission", missionId, "status", result.attempt().status()).increment();
        }
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .cacheControl(CacheControl.noStore())
                .body(result.attempt());
    }

    public record SubmitAttemptRequest(
            @NotNull UUID attemptId,
            @NotBlank @Size(max = 64) String scenarioVersion,
            @NotNull @Size(max = 65_536) String config,
            JsonNode clientReport) {
    }
}

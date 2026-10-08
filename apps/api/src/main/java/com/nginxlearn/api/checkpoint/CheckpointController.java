package com.nginxlearn.api.checkpoint;

import java.util.List;
import java.util.regex.Pattern;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import com.nginxlearn.api.identity.Learner;

@RestController
@RequestMapping("/api/v1/checkpoints")
public class CheckpointController {

    private static final Pattern SCOPE_ID = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");

    private final CheckpointService checkpointService;

    public CheckpointController(CheckpointService checkpointService) {
        this.checkpointService = checkpointService;
    }

    @GetMapping
    public ResponseEntity<List<Checkpoint>> list(@AuthenticationPrincipal Learner learner) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(checkpointService.list(learner.id()));
    }

    @GetMapping("/{scope}/{scopeId}")
    public ResponseEntity<Checkpoint> get(@AuthenticationPrincipal Learner learner,
                                          @PathVariable CheckpointScope scope, @PathVariable String scopeId) {
        validateScopeId(scopeId);
        return checkpointService.find(learner.id(), scope, scopeId)
                .map(checkpoint -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(checkpoint))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PutMapping("/{scope}/{scopeId}")
    public ResponseEntity<?> put(@AuthenticationPrincipal Learner learner,
                                 @PathVariable CheckpointScope scope, @PathVariable String scopeId,
                                 @Valid @RequestBody SaveCheckpointRequest request) {
        validateScopeId(scopeId);
        CheckpointService.SaveResult result = checkpointService.save(
                learner.id(), scope, scopeId,
                request.schemaVersion(), request.scenarioVersion(), request.expectedRevision(), request.payload());
        if (!result.saved()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .cacheControl(CacheControl.noStore())
                    .body(new ConflictResponse("REVISION_CONFLICT", result.checkpoint()));
        }
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .cacheControl(CacheControl.noStore())
                .body(result.checkpoint());
    }

    private static void validateScopeId(String scopeId) {
        if (scopeId.length() > 100 || !SCOPE_ID.matcher(scopeId).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID do checkpoint inválido");
        }
    }

    public record SaveCheckpointRequest(
            @NotNull @Min(1) Integer schemaVersion,
            @NotBlank @Size(max = 64) String scenarioVersion,
            @NotNull @Min(0) Long expectedRevision,
            @NotNull JsonNode payload) {
    }

    public record ConflictResponse(String code, Checkpoint current) {
    }
}

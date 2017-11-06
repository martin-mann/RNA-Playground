/*
University of Freiburg WS 2017/2018
Chair for Bioinformatics
Supervisor: Martin Raden
Author: Alexander Mattheis
*/

"use strict";

/**
 * Defines tasks after page-loading.
 */
$(document).ready(function () {
    if (loaded === ALGORITHMS.FENG_DOOLITTLE) {  // to avoid self execution on a script import
        fengDoolittle.startFengDoolittle();
        loaded = ALGORITHMS.NONE;
    }
});

(function () {  // namespace
    // public methods
    namespace("fengDoolittle", startFengDoolittle, FengDoolittle, getInput, setInput, compute, computePairwiseData,
        getOutput, setIO, getSuperclass);

    // instances
    var multiSequenceAlignmentInstance;

    var fengDoolittleInstance;
    var gotohInstance;

    // shared variables
    var inputData = {};  // stores the input of the algorithm
    var outputData = {};  // stores the output of the algorithm

    /**
     * Function managing objects.
     */
    function startFengDoolittle() {
        var multiSequenceInterface = new interfaces.multiSequenceInterface.MultiSequenceInterface();
        multiSequenceInterface.startMultiSequenceInterface(FengDoolittle, ALGORITHMS.FENG_DOOLITTLE);
    }

    /*---- ALGORITHM ----*/
    /**
     * Computes global affine multi-alignments (non-optimal approach).
     * Extended (= affine) version of the original Feng-Doolittle approaches
     * between 1986 and 1997.
     * @constructor
     * @augments MultiSequenceAlignment
     */
    function FengDoolittle() {
        fengDoolittleInstance = this;

        // variables
        this.type = ALGORITHMS.FENG_DOOLITTLE;

        // instances (do not change order)
        multiSequenceAlignmentInstance = new bases.multiSequenceAlignment.MultiSequenceAlignment(this);
        gotohInstance = new gotoh.Gotoh();

        // public class methods
        this.getInput = getInput;

        this.setInput = setInput;
        this.compute = compute;
        this.computePairwiseData = computePairwiseData;
        this.getOutput = getOutput;

        this.setIO = setIO;
        this.getSuperclass = getSuperclass;
    }

    /**
     * Returns the input data of the algorithm.
     * @return {Object} - Contains all input data.
     */
    function getInput() {
        return inputData;
    }

    /**
     * Sets the algorithm input for an appropriate algorithm
     * which is using the inputViewmodel properties in its computations.
     * @param inputViewmodel {Object} - The InputViewmodel of an appropriate algorithm.
     */
    function setInput(inputViewmodel) {
        multiSequenceAlignmentInstance.setIO(inputData, {});
        multiSequenceAlignmentInstance.setInput(inputViewmodel);
    }

    /**
     * Starts the computation.
     */
    function compute() {
        computePairwiseData();
        computeDistancesFromSimilarities();
        createDistanceMatrix();
        createProgressiveAlignment(getPhylogeneticTree());

        outputData.score = formats.scoringFunctions.getAffineSumOfPairsScore(inputData , outputData.progressiveAlignment);
        return [inputData, outputData];
    }

    /**
     * Computes scores (similarities),
     * the number of gaps, the alignment lengths
     * and so on between all sequences.
     */
    function computePairwiseData() {
        multiSequenceAlignmentInstance.setIO(inputData, outputData);
        multiSequenceAlignmentInstance.computePairwiseData(gotohInstance);
    }

    /**
     * Converting the pairwise similarities into distances
     * by using the Feng-Doolittle formulas.
     * Hint: The factor 100 is really
     * inside the logarithm to scale S^eff(a,b) between (0,100].
     * Hint 2: Verified with original paper and several sources.
     * @example:
     * D(a,b) = -ln(S^eff(a,b) * 100)
     * where
     * S^eff(a,b) = [S(a,b) - S^rand(a,b)] / [S^max(a,b) - S^rand(a,b)]
     *
     * Hint: The factor 100 was omitted in the computation (to avoid negative distances),
     * because it works only with very big S^max(a,b) (very long sequences).
     * Also, the real Feng-Doolittle uses substitution matrices instead of a simple scoring-function.
     *
     * @see: https://doi.org/10.1007/PL00006155
     * Feng, Da-Fei, and Russell F. Doolittle.
     * "Converting amino acid alignment scores into measures of evolutionary time:
     * a simulation study of various relationships." Journal of molecular evolution 44.4 (1997): 361-370.
     *
     * S^eff(a,b) should scale between [0,1]
     * where 1 means identical and 0 means totally non-identical,
     * but in reality S^rand can be bigger as S(a,b) and we can get negative values of S^eff(a,b).
     * To avoid negative values the approach from the paper linked above is used.
     *
     * The idea:
     * if [S(a,b) - S^rand(a,b)] < 0
     * then you set [S(a,b) - S^rand(a,b)] = 0.001 (other values are allowed)
     *
     * Hint: for [S(a,b) - S^rand(a,b)] == 0, it was not defined,
     * but for simplicity it is used [S(a,b) - S^rand(a,b)] = FENG_DOOLITTLE_CONSTANT
     *
     * Hint 3: Because of floating point errors,
     * it is also maybe possible, that [S^max(a,b) - S^rand(a,b)] <= 0.
     * In this case [S^max(a,b) - S^rand(a,b)] is set to FENG_DOOLITTLE_CONSTANT
     * ([S^max(a,b) - S^rand(a,b)] <= 0 is mathematically not possible,
     * because duplicate sequences are removed)
     */
    function computeDistancesFromSimilarities() {
        outputData.distances = [];

        // going over all similarities
        for (var i = 0; i < outputData.similarities.length; i++) {
            var score = outputData.similarities[i];

            // retrieve parameters
            var alignmentLength = outputData.alignmentLengths[i];
            var sequences = outputData.sequencePairs[i];
            var numOfGaps = outputData.gapNumbers[i];
            var numOfGapStarts = outputData.gapStarts[i];

            var scoreRandom = getApproximatedRandomScore(alignmentLength, sequences[0], sequences[1], numOfGaps, numOfGapStarts);
            var scoreMax = getAverageMaximumScore(sequences[0], sequences[1]);

            var dividend = score - scoreRandom;
            var divisor = scoreMax - scoreRandom;

            var scoreEffective = 0;
            if (dividend <= 0) dividend = FENG_DOOLITTLE_CONSTANT;
            if (divisor <= 0) divisor = FENG_DOOLITTLE_CONSTANT;  // mathematically not possible, but because of FLOATING POINT ERRORS

            scoreEffective = dividend / divisor;

            outputData.distances.push(-Math.log(scoreEffective));  // natural logarithm
        }
    }

    /**
     * Computes an approximation of the random score for aligning two sequences
     * by using the approximative formula from 1996 of Feng and Doolittle.
     * Hint: Usually random shuffling is used (1987),
     * but then the algorithm would become non-deterministic and it couldn't be tested so easy.
     * @param alignmentLength - The length of the alignment (number of columns).
     * @param sequenceA - The first (not aligned) sequence.
     * @param sequenceB - The second (not aligned) sequence.
     * @param numOfGaps - The number of gaps in the alignment of sequence a and b.
     * @param numOfGapStarts - The number of gap starts in the alignment of sequence a and b.
     * @see: https://doi.org/10.1016/S0076-6879(96)66023-6
     * Feng, Da-Fei and Doolittle, Russell F. «[21] Progressive alignment of amino
     * acid sequences and construction of phylogenetic trees from them».
     * In: Methods in enzymology 266 (1996), pp. 368–382
     *
     * Hint 2: The penalty is a negated value in the paper!
     * So, for example a PAM250-matrix has a positive penalty like d=8.
     * This is the reason for writing a "+" instead of "-" in the formula:
     * ... + N_{a,b}(gaps) * \beta
     *
     * Hint 3: Mismatches s(i,j) have been omitted in the original formula! Probably this was a mistake.
     *
     * @example:
     * S^rand(a,b)
     * = [1/L(a,b)] * [\sum_{i in A(a,b)} \sum_{j in A(b)} s(i,i) N_a(i) N_b(j)]
     * + N_{a,b}(gaps) * beta
     * + N_{a,b}(gap-starts) * alpha
     * @return {number} - The expected score.
     */
    function getApproximatedRandomScore(alignmentLength, sequenceA, sequenceB, numOfGaps, numOfGapStarts) {
        var doubleSum = 0;

        var aChars = getUniqueChars(sequenceA);
        var bChars = getUniqueChars(sequenceB);

        for (var i = 0; i < aChars.length; i++) {
            var aChar = aChars[i];

            for (var j = 0; j < bChars.length; j++) {
                var bChar = bChars[j];

                var similarity = aChar === bChar ? inputData.match : inputData.mismatch;
                var frequencyInA = getFrequency(aChar, sequenceA);
                var frequencyInB = getFrequency(bChar, sequenceB);
                doubleSum += similarity * frequencyInA * frequencyInB;
            }
        }

        return (1/alignmentLength) * doubleSum + numOfGaps * inputData.enlargement + numOfGapStarts * inputData.baseCosts;
    }

    /**
     * Returns unique characters of both sequences.
     * @param sequence {string} - The first sequence in which is searched.
     * @return {Array} - Array of characters without duplicates.
     */
    function getUniqueChars(sequence) {
        var chars = [];

        for (var i = 0; i < sequence.length; i++) {
            if (chars.indexOf(sequence[i]) === -1)
                chars.push(sequence[i]);
        }

        return chars;
    }

    /**
     * Returns the absolute frequency of a char in a sequence.
     * @param char {string} - The char of which the frequency is computed.
     * @param sequence {string} - The sequence in which is counted.
     * @return {number} - The absolute frequency.
     */
    function getFrequency(char, sequence) {
        var charFrequency = 0;

        for (var i = 0; i < sequence.length; i++) {
            if (sequence[i] === char)
                charFrequency++;
        }

        return charFrequency;
    }

    /**
     * Computes the average score of aligning both sequences with themselves.
     * @param sequenceA {string} - The first sequence which was aligned.
     * @param sequenceB {string} - The second sequence which was aligned.
     * @example:
     * S^max(a,b) = [S(a,a) + S(b,b)] / 2
     */
    function getAverageMaximumScore(sequenceA, sequenceB) {
        return (getMaximumScore(sequenceA) + getMaximumScore(sequenceB)) / 2;
    }

    /**
     * Returns the maximum score for a sequence.
     * @param sequence {string} - The sequence for which the maximum score is computed.
     * @return {number} - The maximum score.
     * @example: S(a,a)
     */
    function getMaximumScore(sequence) {
        return inputData.match * sequence.length;
    }

    /**
     * Creates dependency between cluster names and distances.
     * So, a function dist(a,b) which giving you
     * for two cluster-names a and b the distance
     * (needed for the clustering algorithm).
     * Hint: The matrix for visualization purposes is created
     * in the corresponding HTML and the corresponding interface files.
     * Hint 2: Diagonal is not needed because it is full of zeros and not needed.
     * @see: It is based on the code of Alexander Mattheis in project Algorithms for Bioninformatics.
     */
    function createDistanceMatrix() {
        outputData.clusterNames = getClusterNames();

        var names = {};

        var currentNamePos = 0;
        for (var i = 0; i < inputData.sequences.length; i++) {
            if (inputData.arrayPositionsOfRemovedSequences.indexOf(i) === -1) {  // if sequence is a used sequence
                names[inputData.sequences[i]] = outputData.clusterNames[currentNamePos];
                currentNamePos++;
            }
        }

        outputData.distanceMatrix = {};
        outputData.sequencePairNames = [];

        // right half upper diagonal
        for (var i = 0; i < outputData.distances.length; i++) {
            var sequencePair = outputData.sequencePairs[i];

            var firstClusterName = names[sequencePair[0]];
            var secondClusterName = names[sequencePair[1]];

            outputData.distanceMatrix[[firstClusterName, secondClusterName]] = outputData.distances[i];
            outputData.sequencePairNames.push([firstClusterName, secondClusterName]);
        }

        outputData.distanceMatrixLength = inputData.sequences.length - inputData.arrayPositionsOfRemovedSequences.length;
    }

    /**
     * Returns names for clusters associated with the distance data.
     * Hint: After all characters are depleted,
     * a number is concatenated to the character
     * to make this function generic.
     * Hint: Duplicates do not get a name
     * by checking the array of removed positions (if not removed, then create name).
     * @example:
     * CLUSTER NAMES:
     * a, b, c, ..., z,         FIRST EPISODE
     * a2, b2, c2, ..., z2,     SECOND EPISODE
     * a3, b3, ...              THIRD ...
     * @return {Array} - The cluster names.
     */
    function getClusterNames() {
        var clusterNames = [];
        var currentEpisode = 1;

        // for every pairwise distance we need a symbol
        for (var i = 0; i < inputData.sequences.length; i++) {
            if (i < CLUSTER_NAMES.length && inputData.arrayPositionsOfRemovedSequences.indexOf(i) === -1)
                clusterNames.push(CLUSTER_NAMES[i]);  // add a, b, c, ..., z

            if (i >= CLUSTER_NAMES.length && i % CLUSTER_NAMES.length === 0)  // out of characters
                currentEpisode++;  // new episode

            // out of characters -> a2, b2, c2, ..., z2, a3, b3, ...
            if (i >= CLUSTER_NAMES.length && inputData.arrayPositionsOfRemovedSequences.indexOf(i) === -1)
                clusterNames.push(CLUSTER_NAMES[i % CLUSTER_NAMES.length] + SYMBOLS.EMPTY + currentEpisode);
        }

        return clusterNames;
    }

    /**
     * Using a clustering algorithm like UPGMA (Group Average)
     * the algorithm returns the binary guide tree branches in creation order.
     * @return {Object} - The tree branches.
     */
    function getPhylogeneticTree() {
        inputData.numOfStartClusters = inputData.sequences.length - inputData.arrayPositionsOfRemovedSequences.length;

        var clustering = new upgma.Upgma();
        clustering.setIO(inputData, outputData);
        var ioData = clustering.compute();
        return ioData[1].treeBranches;
    }

    /**
     * By going through the guide tree branches (in correct merging order),
     * the algorithm generates progressive alignments.
     * Hint: A repeated post order traversal of the tree would be less efficient.
     * This is why just an iteration through the branches is done.
     * @param treeBranches {Object} - The tree branches which are defining the order for the merging process.
     * @see: It is based on the code of Alexander Mattheis in project Algorithms for Bioninformatics.
     */
    function createProgressiveAlignment(treeBranches) {
        initializeGroups();

        for (var i = 0; i < treeBranches.length; i++) {
            var treeBranch = treeBranches[i];

            var leftChildName = treeBranch.leftChild.name;
            var rightChildName = treeBranch.rightChild.name;
            var groupName = treeBranch.name;

            alignGroups(leftChildName, rightChildName, groupName);
        }

        var alignmentWithPlaceHolders = outputData.groups[outputData.allClusterNames[outputData.allClusterNames.length - 1]];
        outputData.progressiveAlignment = replacePlaceholdersWithGaps(alignmentWithPlaceHolders);
    }

    /**
     * Initializes the groups-structure,
     * which is storing the created groups during progressive alignment
     * with the start sequences.
     */
    function initializeGroups() {
        outputData.groups = {};

        var currentNamePos = 0;
        for (var i = 0; i < inputData.sequences.length; i++) {
            if (inputData.arrayPositionsOfRemovedSequences.indexOf(i) === -1) {
                outputData.groups[outputData.clusterNames[currentNamePos]] = [inputData.sequences[i]];
                currentNamePos++;
            }
        }

        // needed for visualization
        outputData.firstGroups = [];
        outputData.secondGroups = [];
        outputData.guideAlignments = [];
        outputData.joinedGroups = [];
        outputData.joinedGroupNames = [];
    }

    /**
     * Aligns two groups or sequences to each other.
     * Groups are aligned by aligning every member of the one group
     * with very member of the other group.
     * Afterwards the best alignment is chosen and used as a guide alignment
     * to which the other group members are added,
     * such that characters which were aligned before in the group block,
     * are still together.
     * After the two groups were merged together,
     * all gaps SYMBOLS.GAP are replaced with a placeholder element SYMBOLS.NONE,
     * to preserve the gap (avoid gap movement).
     * @param leftChildName {string} - The name of the left child group or sequence.
     * @param rightChildName {string} - The name of the right child group or sequence
     * @param groupName {string} - The name of the new group.
     * Hint: For the sequence alignment the previously computed sequence-scores are used.
     */
    function alignGroups(leftChildName, rightChildName, groupName) {
        var group1Sequences = getGroupSequences(leftChildName);
        var group2Sequences = getGroupSequences(rightChildName);

        var bestAlignment = getBestAlignment(group1Sequences, group2Sequences);

        outputData.groups[groupName] = createGroup(group1Sequences, group2Sequences, bestAlignment);

        // for visualization of steps
        outputData.guideAlignments.push(bestAlignment);
        outputData.firstGroups.push(group1Sequences);
        outputData.secondGroups.push(group2Sequences);
        outputData.joinedGroups.push(outputData.groups[groupName]);
        outputData.joinedGroupNames.push(groupName);
    }

    /**
     * Returns the sequences of a group.
     * @param groupName {Array} - The name of the group.
     */
    function getGroupSequences(groupName) {
        return outputData.groups[groupName];
    }

    /**
     * Returns the best alignment (with the highest score) after
     * a pair-wise alignment of the group sequences of both groups
     * or after a look-up in the previously computed alignments for the start-sequences.
     * @param group1Sequences {Array} - The sequences of the first group.
     * @param group2Sequences {Array} - The sequences of the second group.
     */
    function getBestAlignment(group1Sequences, group2Sequences) {
        var maxScore = Number.NEGATIVE_INFINITY;
        var maxAlignment = [];

        // iterate through all sequences and search for search for alignment with maximum similarity
        for (var i = 0; i < group1Sequences.length; i++) {
            var sequence1 = group1Sequences[i];

            for (var j = 0; j < group2Sequences.length; j++) {
                var sequence2 = group2Sequences[j];
                var asData = getAlignmentAndScore(sequence1, sequence2);

                if (asData[1] > maxScore) {
                    maxScore = asData[1];
                    maxAlignment = asData[0];
                }
            }
        }

        return maxAlignment;
    }

    /**
     * Returns the initial previously computed alignment of the both sequences.
     * It avoids a time-intensive recomputation.
     * @param sequence1 {string} - The first sequence.
     * @param sequence2 {string} - The second sequence.
     * @return {string} - The initial alignment.
     */
    function getInitialAlignment(sequence1, sequence2) {
        return outputData.alignmentsAndScores[[sequence1, sequence2]];
    }

    /**
     * Returns the alignment and score.
     * @param sequence1 {string} - The first sequence.
     * @param sequence2 {string} - The second sequence.
     * @return {[string, number]} - The alignment and score.
     */
    function getAlignmentAndScore(sequence1, sequence2) {
        var alignmentAndScore = outputData.alignmentsAndScores[[sequence1, sequence2]];  // constant time!

        if (alignmentAndScore !== undefined)
            return alignmentAndScore;

        var input = {};
        multiSequenceAlignmentInstance.initializeInput(input);
        var ioData = multiSequenceAlignmentInstance.computeWithAlgorithm(gotohInstance, input, sequence1, sequence2);

        return [ioData[1].alignments[0], ioData[1].score];
    }

    /**
     * Creates a group out of the sequences with the help of the guide-alignment
     * and replaces all gaps SYMBOLS.GAP with the placeholder symbol SYMBOLS.NONE.
     * @param group1Sequences {Array} - The sequences of the first group.
     * @param group2Sequences {Array} - The sequences of the second group.
     * @param guideAlignment {Object} - The alignment which is used to align the other group members.
     * @return {Object} - The MSA group (MSA alignment).
     * @see: It is based on the code of Alexander Mattheis in project Algorithms for Bioninformatics.
     */
    function createGroup(group1Sequences, group2Sequences, guideAlignment) {
        var guideSequence1 = guideAlignment[0];
        var guideSequence2 = guideAlignment[2];

        if (group1Sequences.length === 1 && group2Sequences.length === 1)  // if already aligned, because only two sequences
            return replaceGapsWithPlaceHolder([guideSequence1, guideSequence2]);

        // first all group members of group1Sequences are added to the guideSequence1
        // and then all group members of group2Sequences are added to the guideSequence2
        // and afterwards both groups are joined
        var firstGroup = getGuidedGroup(group1Sequences, guideSequence1);
        var secondGroup = getGuidedGroup(group2Sequences, guideSequence2);

        return replaceGapsWithPlaceHolder(firstGroup.concat(secondGroup));
    }

    /**
     * Adds the group sequences appropriately to the guide sequence and returns the group.
     * @param groupSequences {Array} - The sequences which should be added to the guide sequence.
     * @param guideSequence {Array} - The sequence which is used to align the sequences of the group.
     * @return {Array} - The group in which group sequences have been added to the guide sequence.
     */
    function getGuidedGroup(groupSequences, guideSequence) {
        if (groupSequences.length === 1)  // if only one element in group
            return [guideSequence];

        var currentPosition = 0;
        var alignedSequence = SYMBOLS.EMPTY;
        var guidedGroup = [];

        // going through each member of the group
        // and add new gaps into the group-sequence
        // accordingly to the "new" gaps in the guide sequence
        for (var i = 0; i < groupSequences.length; i++) {
            var currentSequence = groupSequences[i];

            // going through the guide-sequence and adding step by step a new symbol
            for (var j = 0; j < guideSequence.length; j++) {
                var symbol = guideSequence[j];

                if (symbol !== SYMBOLS.GAP) {
                    alignedSequence += currentSequence[currentPosition];
                    currentPosition++;
                } else {
                    alignedSequence += SYMBOLS.GAP;
                }
            }

            guidedGroup.push(alignedSequence);  // adding aligned groupSequences[i] to the group
            currentPosition = 0;
            alignedSequence = SYMBOLS.EMPTY;
        }

        return guidedGroup;
    }

    /**
     * Returns an array of sequences in which the gaps SYMBOLS.GAP of sequences are replaced with placeholders SYMBOLS.NONE.
     * @param group {Array} - The group in which gaps are replaced with placeholders.
     * @return {Array} - The array of aligned sequences in which the gaps are replaced by placeholders.
     */
    function replaceGapsWithPlaceHolder(group) {
        for (var i = 0; i < group.length; i++) {
            group[i] = group[i].replace(MULTI_SYMBOLS.GAP, SYMBOLS.NONE);
        }

        return group;
    }

    /**
     * Returns an array of sequences in which the placeholders SYMBOLS.NONE of sequences are replaced with gaps SYMBOLS.GAP.
     * @param group {Array} - The group in which placeholders are replaced with gaps.
     * @return {Array} - The array of aligned sequences in which the gaps are replaced by placeholders.
     */
    function replacePlaceholdersWithGaps(group) {
        for (var i = 0; i < group.length; i++) {
            group[i] = group[i].replace(MULTI_SYMBOLS.NONE, SYMBOLS.GAP);
        }

        return group;
    }

    /**
     * Returns all algorithm output.
     * @return {Object} - Contains all output of the algorithm.
     */
    function getOutput() {
        return outputData;
    }

    /**
     * Sets the input and output of an algorithm.
     * @param input {Object} - Contains all input data.
     * @param output {Object} - Contains all output data.
     */
    function setIO(input, output) {
        inputData = input;
        outputData = output;
    }

    /**
     * Returns the superclass instance.
     * @return {Object} - Superclass instance.
     */
    function getSuperclass() {
        return multiSequenceAlignmentInstance;
    }
}());